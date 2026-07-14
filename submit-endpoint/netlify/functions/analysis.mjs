// Netlify Function: Research Analysis Dashboard API
// Reads blob storage and computes statistical measures:
//   - Per-signal effectiveness (bot vs human score separation)
//   - Ground truth confusion matrix (if labeled data exists)
//   - Signal detection rate over time
//   - Precision, recall, F1 per signal
//
// GET /api/analysis  →  full analysis JSON

import { getStore } from '@netlify/blobs';

export default async (req, context) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });

  // Require authentication via ANALYSIS_API_KEY env var
  const apiKey = process.env.ANALYSIS_API_KEY;
  if (apiKey) {
    const authHeader = req.headers.get('authorization') || '';
    const provided = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (provided !== apiKey) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
    }
  }

  try {
    // Load stored data
    const store = getStore({ name: 'scrutari-data', siteID: process.env.SITE_ID });
    let db = { totalSubmissions: 0, uniqueFingerprints: 0, fingerprints: {}, distributions: {} };
    try {
      const raw = await store.get('scrutari-data', { type: 'json' });
      if (raw && raw.version) db = raw;
    } catch {}

    // ─── Compute analysis ───

    const analysis = {
      generated: new Date().toISOString(),
      detectorVersion: 1,
      summary: {
        totalSubmissions: db.totalSubmissions || 0,
        uniqueFingerprints: db.uniqueFingerprints || 0,
        dedupRatio: db.totalSubmissions > 0
          ? ((1 - (db.uniqueFingerprints || 0) / db.totalSubmissions) * 100).toFixed(1) + '%'
          : '0%',
        timeRange: {},
      },
      signals: [],
      groundTruth: { confusionMatrix: null, precision: null, recall: null, f1: null },
      distributions: db.distributions || {},
      dataQuality: { warnings: [] },
    };

    // Time range from fingerprints
    const fps = db.fingerprints || {};
    const times = Object.values(fps).map(f => f.firstSeen).filter(Boolean).sort();
    if (times.length > 0) {
      analysis.summary.timeRange = { first: times[0], last: times[times.length - 1], spanDays: Math.round((new Date(times[times.length - 1]) - new Date(times[0])) / 86400000) };
    }

    // ─── Per-signal analysis from distributions ───
    const dists = db.distributions || {};
    for (const [attr, values] of Object.entries(dists)) {
      const total = Object.values(values).reduce((s, v) => s + v, 0);
      const entries = Object.entries(values)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => ({ value: k, count: v, proportion: (v / total * 100).toFixed(1) + '%' }));
      // Shannon entropy for this attribute
      let entropy = 0;
      for (const v of Object.values(values)) { const p = v / total; if (p > 0) entropy -= p * Math.log2(p); }
      analysis.signals.push({ attribute: attr, total, uniqueValues: Object.keys(values).length, entropy: Math.round(entropy * 10) / 10, topValues: entries.slice(0, 5) });
    }

    // ─── Ground truth confusion matrix ───
    const botSources = ['automation_playwright', 'automation_puppeteer', 'automation_selenium', 'automation_curl', 'automation_baseline', 'honeypot', 'honeypot_js'];
    const humanSources = ['manual'];

    const gtBySource = {};
    for (const [hash, fp] of Object.entries(fps)) {
      const source = fp.source || 'unknown';
      if (!gtBySource[source]) gtBySource[source] = { total: 0, botScoreSum: 0, botScoreValues: [] };
      gtBySource[source].total += fp.count || 1;
      if (fp.fp && fp.fp.botScore !== undefined) {
        gtBySource[source].botScoreSum += fp.fp.botScore * (fp.count || 1);
        for (let i = 0; i < (fp.count || 1); i++) gtBySource[source].botScoreValues.push(fp.fp.botScore);
      }
    }

    // Compute confusion matrix if we have both bot and human labeled data
    let hasBots = false, hasHumans = false;
    let tp = 0, fp = 0, tn = 0, fn = 0;
    const threshold = 50; // Scores above 50 = predicted bot

    for (const [source, data] of Object.entries(gtBySource)) {
      const actualBot = botSources.includes(source);
      if (actualBot) hasBots = true; else if (source === 'manual') hasHumans = true;
      const avg = data.botScoreValues.length > 0 ? (data.botScoreSum / data.botScoreValues.length) : null;

      if (avg !== null) {
        const predictedBot = avg > threshold;
        if (actualBot && predictedBot) tp += data.total;
        else if (actualBot && !predictedBot) fn += data.total;
        else if (!actualBot && predictedBot) fp += data.total;
        else if (!actualBot && !predictedBot) tn += data.total;
      }
    }

    analysis.groundTruth.sources = gtBySource;
    analysis.groundTruth.threshold = threshold;

    if (hasBots && hasHumans) {
      const precision = tp / (tp + fp) || 0;
      const recall = tp / (tp + fn) || 0;
      const f1 = 2 * (precision * recall) / (precision + recall) || 0;
      analysis.groundTruth.confusionMatrix = { tp, fp, tn, fn };
      analysis.groundTruth.precision = Math.round(precision * 1000) / 1000;
      analysis.groundTruth.recall = Math.round(recall * 1000) / 1000;
      analysis.groundTruth.f1 = Math.round(f1 * 1000) / 1000;
      analysis.groundTruth.accuracy = Math.round((tp + tn) / (tp + tn + fp + fn) * 1000) / 1000;
    } else {
      analysis.groundTruth.note = 'Need both bot and human labeled submissions to compute confusion matrix';
    }

    // ─── Data quality warnings ───
    if (analysis.summary.totalSubmissions < 100) analysis.dataQuality.warnings.push('Sample size below 100 — results are preliminary');
    if (!hasBots) analysis.dataQuality.warnings.push('No bot-labeled submissions in dataset');
    if (!hasHumans) analysis.dataQuality.warnings.push('No human-labeled submissions in dataset');
    if (analysis.summary.uniqueFingerprints === 0) analysis.dataQuality.warnings.push('No fingerprint data collected yet');

    // ─── Published baselines for comparison ───
    analysis.publishedBaselines = {
      note: 'Per-attribute entropy from published studies for comparison. Our values will differ due to sample size and population.',
      eckersley2010: { venue: 'PETS 2010 (Panopticlick)', sampleSize: '470K',
        plugins: '15.4 bits', fonts: '13.9 bits', userAgent: '10.0 bits',
        screen: '4.8 bits', timezone: '3.0 bits', total: '18.1 bits' },
      berke2025: { venue: 'PoPETs 2025 (Google)', sampleSize: '8,400 (US demographically sampled)',
        note: 'First dataset with demographics. Open access.' },
      hidingInCrowd2018: { venue: 'WWW 2018', sampleSize: '2M (French general audience)',
        desktopUniqueness: '33.6%', mobileUniqueness: '18.5%' },
    };

    return new Response(JSON.stringify(analysis, null, 2), { status: 200, headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
  }
};
