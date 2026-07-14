'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3456;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const RATE_LIMIT_MS = process.env.RATE_LIMIT_MS ? parseInt(process.env.RATE_LIMIT_MS, 10) : 5000;
const MAX_BODY_BYTES = parseInt(process.env.MAX_BODY_BYTES, 10) || 102400; // 100KB default

fs.mkdirSync(DATA_DIR, { recursive: true });

// Normalize IP address for consistent rate limiting and anonymization
// Handles IPv6-mapped IPv4 (::ffff:x.x.x.x), bracketed IPv6 ([::1]), and native IPv6
function normalizeIP(ip) {
  if (!ip || ip === 'unknown') return 'unknown';
  if (ip.startsWith('[') && ip.endsWith(']')) ip = ip.slice(1, -1);
  if (ip.startsWith('::ffff:')) return ip.substring(7);
  if (ip === '::1') return '127.0.0.1';
  return ip;
}

// Labeled sources for ground truth validation
const ALLOWED_SOURCES = [
  'manual', 'automation_baseline', 'automation_playwright', 'automation_playwright_stealth',
  'automation_puppeteer', 'automation_puppeteer_stealth', 'automation_selenium',
  'automation_selenium_stealth', 'automation_http', 'automation_curl',
];
const MAX_DB_SIZE = 800 * 1024 * 1024; // 800MB
const MAX_ARCHIVES = 3; // Keep only this many archive files

// Sliding window rate limiter â€” per-IP sorted timestamp array
// O(log n) cleanup on each check using binary search
class SlidingWindowRateLimiter {
  constructor(windowMs = 5000, maxPerWindow = 1) {
    this.windowMs = windowMs;
    this.maxPerWindow = maxPerWindow;
    this._windows = new Map();
  }

  allow(ip) {
    const now = Date.now();
    let timestamps = this._windows.get(ip);
    const cutoff = now - this.windowMs;

    if (timestamps) {
      // Binary search for first timestamp >= cutoff
      let lo = 0, hi = timestamps.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (timestamps[mid] < cutoff) lo = mid + 1;
        else hi = mid;
      }
      timestamps = timestamps.slice(lo);
    } else {
      timestamps = [];
    }

    if (timestamps.length >= this.maxPerWindow) return false;
    timestamps.push(now);
    this._windows.set(ip, timestamps);
    return true;
  }

  prune() {
    const cutoff = Date.now() - this.windowMs;
    for (const [ip, timestamps] of this._windows) {
      const valid = timestamps.filter(t => t >= cutoff);
      if (valid.length === 0) this._windows.delete(ip);
      else this._windows.set(ip, valid);
    }
  }

  get size() { return this._windows.size; }
}

const rateLimiter = new SlidingWindowRateLimiter(RATE_LIMIT_MS, 1);
setInterval(() => rateLimiter.prune(), 60000); // Prune stale entries every 60s

function schemaValidate(data) {
  const errors = [];
  if (data === null || typeof data !== 'object') return ['Request body must be a JSON object'];
  if (typeof data.version !== 'number') errors.push('version must be a number');
  if (data.version < 1) errors.push('version must be >= 1');
  // Source validation
  if (data.source && !ALLOWED_SOURCES.includes(data.source)) {
    errors.push('Invalid source: ' + data.source);
  }
  return errors.length > 0 ? errors : null;
}

// Load or initialize store
function loadStore() {
  const file = path.join(DATA_DIR, 'store.json');
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    }
  } catch (e) { console.error('Error loading store:', e.message); }
  return {
    version: 2, created: new Date().toISOString().split('T')[0], updated: null,
    totalSubmissions: 0, uniqueFingerprints: 0,
    fingerprints: {}, distributions: {}
  };
}

function saveStore(db) {
  const file = path.join(DATA_DIR, 'store.json');
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db), 'utf-8');
  fs.renameSync(tmp, file);
  // Archive: if store gets large, copy to dated backup and reset
  const size = fs.statSync(file).size;
  if (size > MAX_DB_SIZE) {
    const archiveFile = path.join(DATA_DIR, `store-archive-${new Date().toISOString().split('T')[0]}.json`);
    fs.copyFileSync(file, archiveFile);
    // Reset store (keep metadata)
    db.fingerprints = {};
    db.distributions = {};
    db.archivedAt = new Date().toISOString();
    saveStore(db);
    console.log(`Archived store to ${archiveFile}, reset for continuing collection`);

    // Prune old archives: keep only the MAX_ARCHIVES most recent
    try {
      const archives = fs.readdirSync(DATA_DIR)
        .filter(f => f.startsWith('store-archive-'))
        .sort()
        .reverse();
      for (let i = MAX_ARCHIVES; i < archives.length; i++) {
        fs.unlinkSync(path.join(DATA_DIR, archives[i]));
        console.log(`Removed old archive: ${archives[i]}`);
      }
    } catch (e) {
      console.error('Error pruning archives:', e.message);
    }
  }
  return size;
}

// eslint-disable-next-line no-unused-vars
function anonymizeIP(rawIp) {
  return crypto.createHash('sha256').update(normalizeIP(rawIp) + 'scrutari-salt').digest('hex').substring(0, 16);
}

function computeHash(data) {
  const fp = {
    detectorVersion: data.detectorVersion || 1, screenClass: data.screenClass, hasWASM: data.hasWASM, hasWebGL: data.hasWebGL,
    hasCanvas: data.hasCanvas, hasAudio: data.hasAudio, fontCount: data.fontCount,
    gpuClass: data.gpuClass, tzRegion: data.tzRegion, cpuCores: data.cpuCores,
    deviceMemory: data.deviceMemory, darkMode: data.darkMode, engine: data.engine,
    adblockDetected: data.adblockDetected, totalEntropyBits: data.totalEntropyBits,
    botScore: data.botScore, ipVersion: data.ipVersion,
  };
  return crypto.createHash('sha256').update(JSON.stringify(fp)).digest('hex').substring(0, 16);
}

function updateDistribution(dist, key, value) {
  if (value === undefined || value === null) return;
  dist[key] = dist[key] || {};
  // Cap unique values per attribute at 100 to prevent unbounded growth
  if (!(value in dist[key]) && Object.keys(dist[key]).length >= 100) {
    dist[key]['__other'] = (dist[key]['__other'] || 0) + 1;
    return;
  }
  dist[key][value] = (dist[key][value] || 0) + 1;
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'POST only' }));
    return;
  }
  if (req.url !== '/submit') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'POST to /submit' }));
    return;
  }

  const rawIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
  const ip = normalizeIP(rawIp);
  if (!rateLimiter.allow(ip)) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Rate limited' }));
    return;
  }

  let body = '';
  let bodyBytes = 0;
  req.on('data', chunk => {
    bodyBytes += chunk.length;
    if (bodyBytes > MAX_BODY_BYTES) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Request body too large' }));
      req.destroy();
      return;
    }
    body += chunk;
  });
  req.on('end', () => {
    try {
      const data = JSON.parse(body);
      const schemaErrors = schemaValidate(data);
      if (schemaErrors) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: schemaErrors.join('; ') }));
        return;
      }

      const db = loadStore();
      const fpHash = computeHash(data);
      const now = new Date().toISOString();

      // Deduplicate
      db.totalSubmissions++;
      if (db.fingerprints[fpHash]) {
        db.fingerprints[fpHash].count++;
        db.fingerprints[fpHash].lastSeen = now;
      } else {
        db.fingerprints[fpHash] = { count: 1, firstSeen: now, lastSeen: now, source: data.source || 'manual', fp: {} };
        db.uniqueFingerprints = Object.keys(db.fingerprints).length;
      }

      // Update marginal distributions
      db.distributions = db.distributions || {};
      updateDistribution(db.distributions, 'screenClass', data.screenClass);
      updateDistribution(db.distributions, 'gpuClass', data.gpuClass);
      updateDistribution(db.distributions, 'tzRegion', data.tzRegion);
      updateDistribution(db.distributions, 'cpuCores', data.cpuCores);
      updateDistribution(db.distributions, 'deviceMemory', data.deviceMemory);
      updateDistribution(db.distributions, 'engine', data.engine);
      updateDistribution(db.distributions, 'fontCount', data.fontCount !== undefined ? String(data.fontCount) : undefined);
      updateDistribution(db.distributions, 'hasWASM', data.hasWASM !== undefined ? String(data.hasWASM) : undefined);
      updateDistribution(db.distributions, 'adblockDetected', data.adblockDetected !== undefined ? String(data.adblockDetected) : undefined);
      updateDistribution(db.distributions, 'source', data.source || 'manual');

      db.updated = now;
      const blobSize = saveStore(db);

      // Stats
      const totalFP = db.totalSubmissions;
      const uniqueFP = db.uniqueFingerprints || Object.keys(db.fingerprints).length;
      const dedupRatio = totalFP > 0 ? ((1 - uniqueFP / totalFP) * 100).toFixed(1) : '0.0';
      const maxCount = Math.max(...Object.values(db.fingerprints).map(f => f.count || 1), 1);

      // Marginal entropy
      let marginalEntropy = 0;
      for (const attr in db.distributions) {
        const values = db.distributions[attr];
        const total = Object.values(values).reduce((s, v) => s + v, 0);
        for (const v in values) { const p = values[v] / total; if (p > 0) marginalEntropy -= p * Math.log2(p); }
      }

      console.log(`[Scrutari] #${totalFP} | unique: ${uniqueFP} | dedup: ${dedupRatio}% | entropy: ${marginalEntropy.toFixed(1)}b`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        submission: `#${totalFP}`,
        isDuplicate: db.fingerprints[fpHash]?.count > 1,
        stats: {
          totalSubmissions: totalFP, uniqueFingerprints: uniqueFP,
          dedupRatio: `${dedupRatio}%`, maxFingerprintFrequency: maxCount,
          marginalEntropyBits: Math.round(marginalEntropy * 10) / 10,
          blobSizeKB: Math.round(blobSize / 1024),
        },
        message: 'Thank you for contributing to research!'
      }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`Scrutari Submission Endpoint (dedup storage)`);
  console.log(`POST http://0.0.0.0:${PORT}/submit`);
  console.log(`Data: ${DATA_DIR}/store.json`);
  console.log(`Auto-archive at ${MAX_DB_SIZE / 1024 / 1024}MB`);
});


