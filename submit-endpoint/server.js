const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3456;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const RATE_LIMIT_MS = process.env.RATE_LIMIT_MS ? parseInt(process.env.RATE_LIMIT_MS) : 5000;

fs.mkdirSync(DATA_DIR, { recursive: true });

// Labeled sources for ground truth validation
const ALLOWED_SOURCES = [
  'manual', 'automation_baseline', 'automation_playwright', 'automation_playwright_stealth',
  'automation_puppeteer', 'automation_puppeteer_stealth', 'automation_selenium',
  'automation_selenium_stealth', 'automation_http', 'automation_curl',
];
const MAX_DB_SIZE = 800 * 1024 * 1024; // 800MB

// Rate limiter
const recent = new Map();
setInterval(() => recent.clear(), 60000);

function rateLimit(ip) {
  const now = Date.now();
  const last = recent.get(ip);
  if (last && now - last < RATE_LIMIT_MS) return false;
  recent.set(ip, now);
  return true;
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
  }
  return size;
}

function anonymizeIP(ip) {
  return crypto.createHash('sha256').update(ip + 'scrutari-salt').digest('hex').substring(0, 16);
}

function computeHash(data) {
  const fp = {
    detectorVersion: data.detectorVersion || 1, screenClass: data.screenClass, hasWASM: data.hasWASM, hasWebGL: data.hasWebGL,
    hasCanvas: data.hasCanvas, hasAudio: data.hasAudio, fontCount: data.fontCount,
    gpuClass: data.gpuClass, tzRegion: data.tzRegion, cpuCores: data.cpuCores,
    deviceMemory: data.deviceMemory, darkMode: data.darkMode, engine: data.engine,
    adblockDetected: data.adblockDetected, totalEntropyBits: data.totalEntropyBits,
    botScore: data.botScore,
  };
  return crypto.createHash('sha256').update(JSON.stringify(fp)).digest('hex').substring(0, 16);
}

function updateDistribution(dist, key, value) {
  if (value === undefined || value === null) return;
  dist[key] = dist[key] || {};
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

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
  if (!rateLimit(ip)) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Rate limited' }));
    return;
  }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    try {
      const data = JSON.parse(body);
      if (!data || typeof data.version !== 'number') throw new Error('Missing version');
      if (data.source && !ALLOWED_SOURCES.includes(data.source)) throw new Error('Invalid source');

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
