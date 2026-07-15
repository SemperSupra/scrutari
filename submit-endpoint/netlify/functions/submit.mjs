// Netlify Function v2: Scrutari Submission Endpoint
// Optimized for research: deduplication + frequency distributions
//
// Storage strategy:
//   Instead of storing every submission individually, we store:
//   1. Deduplicated fingerprints with frequency counters
//   2. Running marginal distributions for each attribute
//   3. Metadata (total submissions, unique count, time range)
//
// Research methodology:
//   - Deduplication preserves frequency distributions (needed for entropy)
//   - K-anonymity calculated from counter values, not raw submissions
//   - Marginal distributions enable per-attribute entropy estimation
//   - First/last seen timestamps enable longitudinal stability analysis
//
// Blob efficiency: ~500 bytes per unique fingerprint + 2KB distributions
//   vs ~500 bytes per submission for raw storage
//   At 10K submissions with ~95% expected uniqueness: ~500KB vs ~5MB

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
const BLOB_NAME = 'scrutari-data';
const SITE_ID = process.env.SITE_ID || process.env.NETLIFY_SITE_ID;
const DEPLOY_ID = process.env.DEPLOY_ID || 'dev';
// Labeled sources for ground truth validation
// manual = human (self-reported), automation_* = known bot type
const ALLOWED_SOURCES = [
  'manual', 'automation_baseline', 'automation_playwright', 'automation_playwright_stealth',
  'automation_puppeteer', 'automation_puppeteer_stealth', 'automation_selenium',
  'automation_selenium_stealth', 'automation_http', 'automation_curl',
];
const MAX_BLOB_SIZE_BYTES = 800 * 1024 * 1024; // 800MB safety limit (1GB free)
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
    };
    const fpHash = createHash('sha256').update(JSON.stringify(fp)).digest('hex').substring(0, 16);

    // Load existing store
    console.log(`[Scrutari] Site: ${SITE_ID}, Deploy: ${DEPLOY_ID}`);
    const store = getStore({ name: 'scrutari-data', siteID: SITE_ID });
    let db = { version: 2, created: new Date().toISOString().split('T')[0], updated: null,
      totalSubmissions: 0, uniqueFingerprints: 0,
      fingerprints: {}, distributions: {} };

    try {
      const raw = await store.get(BLOB_NAME, { type: 'json' });
      if (raw && raw.version) db = raw;
    } catch (e) {
      console.log(`[Scrutari] First submission or blob read error: ${e.message}`);
    }

    // Update deduplicated fingerprint store
    db.totalSubmissions = (db.totalSubmissions || 0) + 1;
    const now = new Date().toISOString();

    if (db.fingerprints[fpHash]) {
      // Existing fingerprint â€” increment counter
      db.fingerprints[fpHash].count = (db.fingerprints[fpHash].count || 1) + 1;
      db.fingerprints[fpHash].lastSeen = now;
    } else {
      // New fingerprint â€” store once
      db.fingerprints[fpHash] = {
        count: 1,
        firstSeen: now,
        lastSeen: now,
        source: data.source || 'manual',
        fp: fp
      };
      db.uniqueFingerprints = Object.keys(db.fingerprints).length;
    }

    // Update marginal distributions (running frequency counts per attribute)
    // Cap unique values per attribute at 100 to prevent unbounded growth
    const MAX_DIST_VALUES = 100;
    const updateDist = (dist, key, value) => {
      if (value === undefined || value === null) return;
      dist[key] = dist[key] || {};
      // Check cardinality before adding a new value
      if (!(value in dist[key]) && Object.keys(dist[key]).length >= MAX_DIST_VALUES) {
        dist[key]['__other'] = (dist[key]['__other'] || 0) + 1;
        return;
      }
      dist[key][value] = (dist[key][value] || 0) + 1;
    };

    db.distributions = db.distributions || {};
    updateDist(db.distributions, 'screenClass', data.screenClass);
    updateDist(db.distributions, 'gpuClass', data.gpuClass);
    updateDist(db.distributions, 'tzRegion', data.tzRegion);
    updateDist(db.distributions, 'cpuCores', data.cpuCores);
    updateDist(db.distributions, 'deviceMemory', data.deviceMemory);
    updateDist(db.distributions, 'engine', data.engine);
    updateDist(db.distributions, 'fontCount', data.fontCount !== undefined ? String(data.fontCount) : undefined);
    updateDist(db.distributions, 'hasWASM', data.hasWASM !== undefined ? String(data.hasWASM) : undefined);
    updateDist(db.distributions, 'adblockDetected', data.adblockDetected !== undefined ? String(data.adblockDetected) : undefined);
    updateDist(db.distributions, 'ipVersion', data.ipVersion || 'unknown');
    updateDist(db.distributions, 'powAnomaly', data._powTiming?.anomalyDetected !== undefined ? String(data._powTiming.anomalyDetected) : undefined);
    updateDist(db.distributions, 'source', data.source || 'manual');

    db.updated = now;

    // Estimate blob size before saving
    const blobSize = new TextEncoder().encode(JSON.stringify(db)).length;
    const remainingGB = ((MAX_BLOB_SIZE_BYTES - blobSize) / (1024 * 1024 * 1024)).toFixed(3);

    // Write back to blob (must JSON.stringify â€” SDK requires string values)
    try {
      await store.set(BLOB_NAME, JSON.stringify(db));
    } catch (e) {
      console.log(`[Scrutari] Blob write error: ${e.message}`);
    }

    // Compute research stats
    const totalFP = db.totalSubmissions;
    const uniqueFP = db.uniqueFingerprints || Object.keys(db.fingerprints).length;
    const dedupRatio = totalFP > 0 ? ((1 - uniqueFP / totalFP) * 100).toFixed(1) : '0.0';
    const maxCount = Math.max(...Object.values(db.fingerprints).map(f => f.count || 1), 1);

    // Entropy estimation (Shannon entropy from marginal distributions)
    // This is a lower bound â€” real joint entropy requires pairwise correlations
    let marginalEntropy = 0;
    for (const attr in db.distributions) {
      const values = db.distributions[attr];
      const total = Object.values(values).reduce((s, v) => s + v, 0);
      for (const v in values) {
        const p = values[v] / total;
        if (p > 0) marginalEntropy -= p * Math.log2(p);
      }
    }

    console.log(`[Scrutari] #${totalFP} | unique: ${uniqueFP} | dedup: ${dedupRatio}% | entropy: ${marginalEntropy.toFixed(1)}b | maxFreq: ${maxCount} | blob: ${(blobSize / 1024).toFixed(0)}KB/${remainingGB}GB`);

    return new Response(JSON.stringify({
      status: 'ok',
      submission: `#${totalFP}`,
      isDuplicate: db.fingerprints[fpHash]?.count > 1,
      stats: {
        totalSubmissions: totalFP,
        uniqueFingerprints: uniqueFP,
        dedupRatio: `${dedupRatio}%`,
        maxFingerprintFrequency: maxCount,
        marginalEntropyBits: Math.round(marginalEntropy * 10) / 10,
        blobSizeKB: Math.round(blobSize / 1024),
      },
      message: 'Thank you for contributing to research!'
    }), { status: 200, headers });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 400, headers });
  }
};





