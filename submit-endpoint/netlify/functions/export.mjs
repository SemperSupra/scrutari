// Netlify Function: Research Data Export
// Returns fingerprint data as newline-delimited JSON (NDJSON) for external analysis.
// Supports cursor-based pagination for large datasets.
//
// GET /api/export?cursor=<hash>&limit=100
//   → NDJSON stream, one fingerprint per line
//   Headers: Content-Type: application/x-ndjson
//   Last line: {"_meta":{"total":N,"returned":N,"nextCursor":"hash"|null}}
//
// Requires ANALYSIS_API_KEY authentication (same as analysis endpoint).

import { getStore } from '@netlify/blobs';

async function readKey(store, key, defaultVal = null) {
  try {
    const raw = await store.get(key, { type: 'json' });
    return (raw !== null && raw !== undefined) ? raw : defaultVal;
  } catch {
    return defaultVal;
  }
}

export default async (req, context) => {
  const headers = {
    'Content-Type': 'application/x-ndjson',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-cache',
  };

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'GET only' }), { status: 405, headers: { ...headers, 'Content-Type': 'application/json' } });
  }

  // Require authentication
  const apiKey = process.env.ANALYSIS_API_KEY;
  if (apiKey) {
    const authHeader = req.headers.get('authorization') || '';
    const provided = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (provided !== apiKey) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...headers, 'Content-Type': 'application/json' } });
    }
  }

  try {
    const store = getStore({ name: 'scrutari-data', siteID: process.env.SITE_ID });
    const idx = await readKey(store, 'idx', []);
    const url = new URL(req.url);
    const cursor = url.searchParams.get('cursor') || null;
    const limit = Math.min(parseInt(url.searchParams.get('limit'), 10) || 100, 10000);

    // Determine slice of idx to enumerate
    let hashes;
    let startIdx = 0;
    if (cursor) {
      const ci = idx.indexOf(cursor);
      if (ci >= 0) startIdx = ci + 1;
      else startIdx = idx.length; // cursor not found → empty result
    }
    hashes = idx.slice(startIdx, startIdx + limit);
    const nextCursor = hashes.length === limit ? hashes[hashes.length - 1] : null;

    // Fetch each fingerprint and build NDJSON lines
    const lines = [];
    for (const hash of hashes) {
      const fpData = await readKey(store, 'fp:' + hash);
      if (fpData) {
        // Flatten the nested fp.fp structure for easier analysis
        const flat = {
          _hash: hash,
          count: fpData.count || 1,
          firstSeen: fpData.firstSeen,
          lastSeen: fpData.lastSeen,
          source: fpData.source || 'unknown',
          // Flatten fingerprint attributes to top level
          ...(fpData.fp || {}),
        };
        lines.push(JSON.stringify(flat));
      }
    }

    // Add metadata as the last line
    lines.push(JSON.stringify({
      _meta: {
        total: idx.length,
        returned: hashes.length,
        limit: limit,
        nextCursor: nextCursor,
        cursor: cursor,
      }
    }));

    const body = lines.join('\n');

    return new Response(body, { status: 200, headers });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } });
  }
};
