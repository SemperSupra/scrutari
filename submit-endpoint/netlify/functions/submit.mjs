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

const BLOB_NAME = 'scrutari-data';
const ALLOWED_SOURCES = ['manual', 'automation_baseline'];
const MAX_BLOB_SIZE_BYTES = 800 * 1024 * 1024; // 800MB safety limit (1GB free)

export default async (req, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers });

  try {
    const data = await req.json();
    if (!data || typeof data.version !== 'number') throw new Error('Missing version');
    if (data.source && !ALLOWED_SOURCES.includes(data.source)) throw new Error('Invalid source');

    // Build deduplication key: SHA-256 of normalized fingerprint attributes
    const fp = {
      screenClass: data.screenClass,
      hasWASM: data.hasWASM, hasWebGL: data.hasWebGL, hasCanvas: data.hasCanvas, hasAudio: data.hasAudio,
      fontCount: data.fontCount, gpuClass: data.gpuClass, tzRegion: data.tzRegion,
      cpuCores: data.cpuCores, deviceMemory: data.deviceMemory, darkMode: data.darkMode,
      engine: data.engine, adblockDetected: data.adblockDetected, totalEntropyBits: data.totalEntropyBits,
      botScore: data.botScore,
    };
    const fpJson = JSON.stringify(fp);
    const fpHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fpJson))
      .then(h => Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16));

    // Load existing store
    const store = context.env.STORE;
    let db = { version: 2, created: new Date().toISOString().split('T')[0], updated: null,
      totalSubmissions: 0, uniqueFingerprints: 0,
      fingerprints: {}, distributions: {} };

    if (store) {
      try {
        const raw = await store.get(BLOB_NAME, { type: 'json' });
        if (raw && raw.version) db = raw;
      } catch { /* first submission */ }
    }

    // Update deduplicated fingerprint store
    db.totalSubmissions = (db.totalSubmissions || 0) + 1;
    const now = new Date().toISOString();

    if (db.fingerprints[fpHash]) {
      // Existing fingerprint — increment counter
      db.fingerprints[fpHash].count = (db.fingerprints[fpHash].count || 1) + 1;
      db.fingerprints[fpHash].lastSeen = now;
    } else {
      // New fingerprint — store once
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
    const updateDist = (dist, key, value) => {
      if (value === undefined || value === null) return;
      dist[key] = dist[key] || {};
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
    updateDist(db.distributions, 'source', data.source || 'manual');

    db.updated = now;

    // Estimate blob size before saving
    const blobSize = new TextEncoder().encode(JSON.stringify(db)).length;
    const remainingGB = ((MAX_BLOB_SIZE_BYTES - blobSize) / (1024 * 1024 * 1024)).toFixed(3);

    // Write back to blob
    if (store) {
      await store.set(BLOB_NAME, db);
    }

    // Compute research stats
    const totalFP = db.totalSubmissions;
    const uniqueFP = db.uniqueFingerprints || Object.keys(db.fingerprints).length;
    const dedupRatio = totalFP > 0 ? ((1 - uniqueFP / totalFP) * 100).toFixed(1) : '0.0';
    const maxCount = Math.max(...Object.values(db.fingerprints).map(f => f.count || 1), 1);

    // Entropy estimation (Shannon entropy from marginal distributions)
    // This is a lower bound — real joint entropy requires pairwise correlations
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
