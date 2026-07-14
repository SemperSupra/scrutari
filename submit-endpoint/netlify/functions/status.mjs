// Netlify Function: Baseline Status + Scheduler Trigger
// Reports baseline freshness and accepts external cron triggers.
//
// Endpoints:
//   GET  /api/status      → baseline freshness report
//   POST /api/status      → external cron trigger acknowledgment
//
// External scheduling (free):
//   1. cron-job.org — GET https://site.netlify.app/api/status every 7 days
//   2. UptimeRobot — GET https://site.netlify.app/api/status monthly

import { getStore } from '@netlify/blobs';

const BASELINE_KEY = 'baseline-tracking';
const EXPECTED_INTERVAL_DAYS = 7;

export default async (req, context) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });

  // Require authentication via ANALYSIS_API_KEY env var (GET only; POST from cron bypasses auth)
  const apiKey = process.env.ANALYSIS_API_KEY;
  if (apiKey && req.method === 'GET') {
    const authHeader = req.headers.get('authorization') || '';
    const provided = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (provided !== apiKey) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
    }
  }

  try {
    const store = getStore({ name: 'scrutari-data', siteID: process.env.SITE_ID });
    let tracking = { lastRun: null, lastResult: null, runs: [] };

    try {
      const raw = await store.get(BASELINE_KEY, { type: 'json' });
      if (raw && raw.lastRun) tracking = raw;
    } catch {}

    // Handle POST — external cron trigger (logs the event)
    if (req.method === 'POST') {
      const now = new Date().toISOString();
      tracking.lastRun = now;
      tracking.lastTrigger = 'external_cron';
      tracking.runs = tracking.runs || [];
      tracking.runs.push({ time: now, source: 'cron', type: 'ping' });
      if (tracking.runs.length > 52) tracking.runs = tracking.runs.slice(-52);

      await store.set(BASELINE_KEY, JSON.stringify(tracking));

      return new Response(JSON.stringify({
        status: 'acknowledged',
        message: 'Cron trigger recorded. Full baseline requires Docker runner.',
        lastRun: now,
        docs: 'https://github.com/SemperSupra/scrutari-private/blob/main/automation/training/REPRODUCIBILITY.md'
      }), { status: 200, headers });
    }

    // GET — status report
    const now = new Date();
    const lastRun = tracking.lastRun ? new Date(tracking.lastRun) : null;
    const daysSince = lastRun ? Math.floor((now - lastRun) / 86400000) : null;
    const isStale = daysSince !== null && daysSince > EXPECTED_INTERVAL_DAYS;

    // Count submissions in blob
    let subCount = 0, uniqueCount = 0;
    try {
      const mainData = await store.get('scrutari-data', { type: 'json' });
      if (mainData) { subCount = mainData.totalSubmissions || 0; uniqueCount = mainData.uniqueFingerprints || 0; }
    } catch {}

    const status = {
      status: isStale ? 'stale' : (lastRun ? 'healthy' : 'never_run'),
      baseline: {
        lastRun: tracking.lastRun || 'never',
        daysSince: daysSince,
        isStale: isStale,
        recommendedAction: isStale ? 'Run: bash automation/run-weekly-baselines.sh' : 'Up to date',
      },
      data: {
        totalSubmissions: subCount,
        uniqueFingerprints: uniqueCount,
      },
      scheduler: {
        type: 'external',
        recommended: 'cron-job.org — GET /api/status every 7 days',
        docs: 'https://cron-job.org',
      },
      timestamp: now.toISOString(),
    };

    return new Response(JSON.stringify(status, null, 2), { status: 200, headers });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
  }
};
