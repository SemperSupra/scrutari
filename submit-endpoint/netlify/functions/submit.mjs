// Netlify Function: Scrutari Submission Endpoint
// Deploy: npx netlify deploy --build
// Requires Netlify Blob Storage (free tier: 1GB, integrated)
// Blob name: scrutari-submissions

const BLOB_NAME = 'scrutari-submissions';

export default async (req, context) => {
  // CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const data = await req.json();

    // Validate
    if (!data || !data.version) {
      return new Response(JSON.stringify({ error: 'Missing version field' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    if (data.source && !['manual', 'automation_baseline'].includes(data.source)) {
      return new Response(JSON.stringify({ error: 'Invalid source' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Add metadata
    data._received = new Date().toISOString();
    data._userAgent = req.headers.get('user-agent') || 'unknown';

    // Store to Netlify Blob
    const store = context.env.STORE; // Netlify Blob is injected as STORE
    if (store) {
      const existing = await store.get(BLOB_NAME, { type: 'json' }).catch(() => []);
      const entries = Array.isArray(existing) ? existing : [];
      entries.push(data);
      await store.set(BLOB_NAME, JSON.stringify(entries));
    }

    console.log(`Submission: ${data.source || 'unknown'} — ${data.botScore !== undefined ? data.botScore + '%' : 'no score'}`);

    return new Response(JSON.stringify({ status: 'ok', message: 'Submission recorded. Thank you!' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
};
