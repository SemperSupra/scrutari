// Netlify Function v3: Scrutari Submission Endpoint
// Per-key blob access — O(1) per submission regardless of dataset size
//
// Storage strategy (v3):
//   Individual blob keys instead of one monolithic document:
//     meta           → { version: 3, totalSubmissions, uniqueFingerprints, ... }
//     fp:<16-char-hash> → { count, firstSeen, lastSeen, source, fp: {...} }
//     dist           → { screenClass: {...}, gpuClass: {...}, ... }
//     idx            → [hash1, hash2, ...]  (ordered array for enumeration)
//
// Benefits over single-blob (v2):
//   - Read/Write per submission is O(1), not O(dataset size)
//   - No serialization/deserialization of the entire dataset
//   - No 800MB blob size limit
//   - No full-blob migration needed (incremental)
//
// Research methodology (unchanged):
//   - Deduplication preserves frequency distributions (needed for entropy)
//   - K-anonymity calculated from counter values, not raw submissions
//   - Marginal distributions enable per-attribute entropy estimation
//   - First/last seen timestamps enable longitudinal stability analysis

import { createHash } from 'crypto';
import { getStore } from '@netlify/blobs';

// Normalize IP address for consistent hashing and logging
function normalizeIP(ip) {
  if (!ip || ip === 'unknown') return 'unknown';
  if (ip.startsWith('[') && ip.endsWith(']')) ip = ip.slice(1, -1);
  if (ip.startsWith('::ffff:')) return ip.substring(7);
  if (ip === '::1') return '127.0.0.1';
  return ip;
}

// Blob store configuration
const STORE_NAME = 'scrutari-data';
const SITE_ID = process.env.SITE_ID || process.env.NETLIFY_SITE_ID;
const DEPLOY_ID = process.env.DEPLOY_ID || 'dev';
// Labeled sources for ground truth validation
// manual = human (self-reported), automation_* = known bot type
const ALLOWED_SOURCES = [
  'manual', 'automation_baseline', 'automation_playwright', 'automation_playwright_stealth',
  'automation_puppeteer', 'automation_puppeteer_stealth', 'automation_selenium',
  'automation_selenium_stealth', 'automation_http', 'automation_curl',
];
const MAX_BODY_BYTES = 102400; // 100KB

// Sliding window rate limiter (in-memory, per warm container)
const _rateWindows = new Map();

function checkRateLimit(ip, windowMs = 5000, maxPerWindow = 1) {
  const now = Date.now();
  const cutoff = now - windowMs;
  let timestamps = _rateWindows.get(ip);
  if (timestamps) {
    let lo = 0, hi = timestamps.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (timestamps[mid] < cutoff) lo = mid + 1; else hi = mid; }
    timestamps = timestamps.slice(lo);
  } else {
    timestamps = [];
  }
  if (timestamps.length >= maxPerWindow) return false;
  timestamps.push(now);
  _rateWindows.set(ip, timestamps);
  return true;
}

// Periodic cleanup of stale rate limit entries
if (typeof globalThis.__ratePrune === 'undefined') {
  globalThis.__ratePrune = setInterval(() => {
    const cutoff = Date.now() - 5000;
    for (const [ip, ts] of _rateWindows) {
      const valid = ts.filter(t => t >= cutoff);
      if (valid.length === 0) _rateWindows.delete(ip);
      else _rateWindows.set(ip, valid);
    }
  }, 60000);
}

// Schema validation
function schemaValidate(data) {
  const errors = [];
  if (data === null || typeof data !== 'object') return ['Request body must be a JSON object'];
  if (typeof data.version !== 'number') errors.push('version must be a number');
  if (data.version < 1) errors.push('version must be >= 1');
  if (data.source && !ALLOWED_SOURCES.includes(data.source)) {
    errors.push('Invalid source: ' + data.source);
  }
  return errors.length > 0 ? errors : null;
}

// Per-key blob helpers
async function readKey(store, key, defaultVal = null) {
  try {
    const raw = await store.get(key, { type: 'json' });
    return (raw !== null && raw !== undefined) ? raw : defaultVal;
  } catch {
    return defaultVal;
  }
}

async function writeKey(store, key, value) {
  const str = JSON.stringify(value);
  try {
    await store.set(key, str);
  } catch (e) {
    console.log(`[Scrutari] Blob write error (${key}): ${e.message}`);
  }
}

export default async (req, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers });

  // Body size check
  const contentLength = parseInt(req.headers.get('content-length') || '0', 10);
  if (contentLength > MAX_BODY_BYTES) {
    return new Response(JSON.stringify({ error: 'Request body too large' }), { status: 413, headers });
  }

  // Rate limiting
  const rawClientIP = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
                   || req.headers.get('x-nf-client-connection-ip') || 'unknown';
  const clientIP = normalizeIP(rawClientIP);
  if (!checkRateLimit(clientIP)) {
    return new Response(JSON.stringify({ error: 'Rate limited' }), { status: 429, headers });
  }

  try {
    const data = await req.json();
    const schemaErrors = schemaValidate(data);
    if (schemaErrors) {
      return new Response(JSON.stringify({ error: schemaErrors.join('; ') }), { status: 400, headers });
    }

    // Build deduplication key: SHA-256 of normalized fingerprint attributes
    const fp = {
      detectorVersion: data.detectorVersion || 1,
      signalScores: data.signalScores || null,
      browserVersion: data.browserVersion || null,
      osArch: data.osArch || null,
      viewport: data.viewport || null,
      dpr: data.dpr || null,
      sessionID: data.sessionID || null,
      visitNumber: data.visitNumber || null,
      screenClass: data.screenClass,
      hasWASM: data.hasWASM, hasWebGL: data.hasWebGL, hasCanvas: data.hasCanvas, hasAudio: data.hasAudio,
      fontCount: data.fontCount, gpuClass: data.gpuClass, tzRegion: data.tzRegion,
      cpuCores: data.cpuCores, deviceMemory: data.deviceMemory, darkMode: data.darkMode,
      engine: data.engine, adblockDetected: data.adblockDetected, totalEntropyBits: data.totalEntropyBits,
      botScore: data.botScore, ipVersion: data.ipVersion, powBenchmarkSpeed: data.powBenchmarkSpeed,
      powChallenge: data.powChallenge, powNonce: data.powNonce, powDifficulty: data.powDifficulty, powProofTime: data.powProofTime,
    };
    const fpKey = 'fp:' + createHash('sha256').update(JSON.stringify(fp)).digest('hex').substring(0, 16);

    console.log(`[Scrutari] Site: ${SITE_ID}, Deploy: ${DEPLOY_ID}`);
    const store = getStore({ name: STORE_NAME, siteID: SITE_ID });

    // --- Migration: check for old v2 single-blob format ---
    const oldBlob = await readKey(store, 'scrutari-data');
    if (oldBlob && oldBlob.version === 2 && oldBlob.fingerprints) {
      console.log('[Scrutari] Migrating from v2 single-blob format to v3 per-key...');
      // Migrate fingerprints to individual keys
      for (const [hash, fpData] of Object.entries(oldBlob.fingerprints)) {
        await writeKey(store, 'fp:' + hash, fpData);
      }
      // Migrate distributions
      if (oldBlob.distributions) {
        await writeKey(store, 'dist', oldBlob.distributions);
      }
      // Build index
      const hashes = Object.keys(oldBlob.fingerprints);
      await writeKey(store, 'idx', hashes);
      // Create meta
      const meta = {
        version: 3,
        created: oldBlob.created || new Date().toISOString().split('T')[0],
        updated: new Date().toISOString(),
        totalSubmissions: oldBlob.totalSubmissions || 0,
        uniqueFingerprints: oldBlob.uniqueFingerprints || Object.keys(oldBlob.fingerprints).length,
        migratedFromV2: true,
        migratedAt: new Date().toISOString(),
      };
      await writeKey(store, 'meta', meta);
      // Delete old key
      try { await store.delete('scrutari-data'); } catch {}
      console.log(`[Scrutari] Migration complete: ${hashes.length} fingerprints migrated`);
    }

    // --- Per-key read: meta, existing fingerprint, distributions ---
    const meta = await readKey(store, 'meta', {
      version: 3,
      created: new Date().toISOString().split('T')[0],
      updated: null,
      totalSubmissions: 0,
      uniqueFingerprints: 0,
    });

    const existingFp = await readKey(store, fpKey);
    const dist = await readKey(store, 'dist', {});

    // --- Update counters ---
    meta.totalSubmissions = (meta.totalSubmissions || 0) + 1;
    const now = new Date().toISOString();

    if (existingFp) {
      // Existing fingerprint — increment counter
      existingFp.count = (existingFp.count || 1) + 1;
      existingFp.lastSeen = now;
      await writeKey(store, fpKey, existingFp);
    } else {
      // New fingerprint — store and add to index
      const newFp = {
        count: 1,
        firstSeen: now,
        lastSeen: now,
        source: data.source || 'manual',
        fp: fp
      };
      await writeKey(store, fpKey, newFp);

      // Update unique count
      meta.uniqueFingerprints = (meta.uniqueFingerprints || 0) + 1;

      // Append to index (grows O(n) but only for new fingerprints)
      const idx = await readKey(store, 'idx', []);
      idx.push(fpKey.substring(3)); // just the hash part
      await writeKey(store, 'idx', idx);
    }

    // --- Update marginal distributions ---
    // Cap unique values per attribute at 100 to prevent unbounded growth
    const MAX_DIST_VALUES = 100;
    const updateDist = (distObj, key, value) => {
      if (value === undefined || value === null) return;
      distObj[key] = distObj[key] || {};
      if (!(value in distObj[key]) && Object.keys(distObj[key]).length >= MAX_DIST_VALUES) {
        distObj[key]['__other'] = (distObj[key]['__other'] || 0) + 1;
        return;
      }
      distObj[key][value] = (distObj[key][value] || 0) + 1;
    };

    updateDist(dist, 'screenClass', data.screenClass);
    updateDist(dist, 'gpuClass', data.gpuClass);
    updateDist(dist, 'tzRegion', data.tzRegion);
    updateDist(dist, 'cpuCores', data.cpuCores);
    updateDist(dist, 'deviceMemory', data.deviceMemory);
    updateDist(dist, 'engine', data.engine);
    updateDist(dist, 'fontCount', data.fontCount !== undefined ? String(data.fontCount) : undefined);
    updateDist(dist, 'hasWASM', data.hasWASM !== undefined ? String(data.hasWASM) : undefined);
    updateDist(dist, 'adblockDetected', data.adblockDetected !== undefined ? String(data.adblockDetected) : undefined);
    updateDist(dist, 'ipVersion', data.ipVersion || 'unknown');
    updateDist(dist, 'powAnomaly', data._powTiming?.anomalyDetected !== undefined ? String(data._powTiming.anomalyDetected) : undefined);

    // Compute client trust score from cross-signal consistency
    var _trustScore = 100;
    if (data._powTiming?.anomalyDetected) _trustScore -= 20;
    if (data._powTiming?.anomalyRatio > 5) _trustScore -= 15;
    if (data._powTiming?.anomalyRatio < 0.2) _trustScore -= 15;
    var _trustBucket = _trustScore >= 80 ? 'high' : (_trustScore >= 50 ? 'medium' : 'low');
    updateDist(dist, 'trustScore', _trustBucket);
    updateDist(dist, 'source', data.source || 'manual');

    // --- Write back per-key ---
    meta.updated = now;
    await writeKey(store, 'meta', meta);
    await writeKey(store, 'dist', dist);

    // Invalidate analysis cache (new data means stale dashboard)
    try { await store.delete('analysis-cache'); } catch (_ac) { /* cache may not exist */ }

    // --- Compute research stats ---
    const totalFP = meta.totalSubmissions;
    const uniqueFP = meta.uniqueFingerprints || 0;
    const dedupRatio = totalFP > 0 ? ((1 - uniqueFP / totalFP) * 100).toFixed(1) : '0.0';
    const maxCount = existingFp ? existingFp.count : 1;

    // Estimate total blob size from meta + dist (dominant contributors)
    const metaStr = JSON.stringify(meta);
    const distStr = JSON.stringify(dist);
    const blobSizeEstimate = metaStr.length + distStr.length;

    // Entropy estimation (Shannon entropy from marginal distributions)
    let marginalEntropy = 0;
    for (const attr in dist) {
      const values = dist[attr];
      const total = Object.values(values).reduce((s, v) => s + v, 0);
      for (const v in values) {
        const p = values[v] / total;
        if (p > 0) marginalEntropy -= p * Math.log2(p);
      }
    }

    console.log(`[Scrutari] #${totalFP} | unique: ${uniqueFP} | dedup: ${dedupRatio}% | entropy: ${marginalEntropy.toFixed(1)}b | maxFreq: ${maxCount} | blob: ${(blobSizeEstimate / 1024).toFixed(0)}KB`);

    return new Response(JSON.stringify({
      status: 'ok',
      submission: `#${totalFP}`,
      isDuplicate: existingFp !== null,
      stats: {
        totalSubmissions: totalFP,
        uniqueFingerprints: uniqueFP,
        dedupRatio: `${dedupRatio}%`,
        maxFingerprintFrequency: maxCount,
        marginalEntropyBits: Math.round(marginalEntropy * 10) / 10,
        blobSizeKB: Math.round(blobSizeEstimate / 1024),
      },
      message: 'Thank you for contributing to research!'
    }), { status: 200, headers });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 400, headers });
  }
};
