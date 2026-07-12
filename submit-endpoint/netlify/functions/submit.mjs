// Netlify Function v2: Scrutari Submission Endpoint
// Uses Netlify Blob Storage (free tier: 1GB, 1M req/mo)
// Deploy: ./deploy-netlify.sh (or follow steps in README)

const BLOB_NAME = 'scrutari-submissions';
const ALLOWED_SOURCES = ['manual', 'automation_baseline'];

export default async (req, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Only POST allowed' }), { status: 405, headers });
  }

  try {
    const data = await req.json();

    // Validate schema
    if (!data || typeof data !== 'object') throw new Error('Invalid JSON body');
    if (typeof data.version !== 'number') throw new Error('Missing required field: version');
    if (data.source && !ALLOWED_SOURCES.includes(data.source)) throw new Error('Invalid source. Use: manual, automation_baseline');
    if (data.botScore !== undefined && (typeof data.botScore !== 'number' || data.botScore < 0 || data.botScore > 100)) {
      throw new Error('botScore must be 0-100');
    }

    // Anonymize: strip any identifying fields sent in error
    const safe = {
      version: data.version,
      botScore: data.botScore,
      botConfidence: data.botConfidence,
      source: data.source || 'manual',
      screenClass: data.screenClass,
      hasWASM: data.hasWASM,
      hasWebGL: data.hasWebGL,
      hasCanvas: data.hasCanvas,
      hasAudio: data.hasAudio,
      fontCount: data.fontCount,
      gpuClass: data.gpuClass,
      tzRegion: data.tzRegion,
      cpuCores: data.cpuCores,
      deviceMemory: data.deviceMemory,
      darkMode: data.darkMode,
      engine: data.engine,
      adblockDetected: data.adblockDetected,
      totalEntropyBits: data.totalEntropyBits,
      submitted: data.submitted,
      _received: new Date().toISOString(),
      _userAgent: req.headers.get('user-agent')?.substring(0, 100) || 'unknown',
    };

    // Store to Netlify Blob Storage
    const store = context.env.STORE;
    let entries = [];
    if (store) {
      try {
        const raw = await store.get(BLOB_NAME, { type: 'json' });
        if (Array.isArray(raw)) entries = raw;
      } catch {
        // First submission — no data yet
      }
      entries.push(safe);
      await store.set(BLOB_NAME, entries);
    }

    // Return stats
    const stats = { total: entries.length, today: entries.filter(e => e._received?.startsWith(new Date().toISOString().split('T')[0])).length };

    console.log(`[Scrutari] Submission: ${safe.source} — ${safe.botScore !== undefined ? safe.botScore + '%' : 'score N/A'} (total: ${stats.total})`);

    return new Response(JSON.stringify({
      status: 'ok',
      message: 'Submission recorded. Thank you for contributing to research!',
      stats
    }), { status: 200, headers });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 400, headers });
  }
};
