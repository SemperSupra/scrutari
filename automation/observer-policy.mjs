// Publication-safe guardrails for synthetic browser observation.
// No source labels, scores or responses are sent to the production data store.
export const ALLOWED_ORIGINS = Object.freeze([
  'https://scrutari-submit-1783887159.netlify.app',
  'https://leak-detector.scrutari.cloud-ip.cc',
  'https://sempersupra.github.io',
]);

export function validateTarget(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new Error('Invalid target URL'); }
  if (url.protocol !== 'https:' || !ALLOWED_ORIGINS.includes(url.origin) ||
      url.username || url.password || url.search || url.hash) {
    throw new Error('Unapproved target (HTTPS, known Scrutari origin and no query required)');
  }
  if (url.origin === 'https://sempersupra.github.io' && url.pathname !== '/scrutari/') {
    throw new Error('Only the Scrutari GitHub Pages path is approved');
  }
  if (url.origin !== 'https://sempersupra.github.io' && url.pathname !== '/') {
    throw new Error('Only the main Scrutari site root is approved');
  }
  return url;
}

export function requestDecision(method, rawUrl, allowedOrigin) {
  let url;
  try { url = new URL(rawUrl); } catch { return 'block-malformed'; }
  if (['data:', 'blob:', 'about:'].includes(url.protocol)) return 'allow-local';
  if (url.origin !== allowedOrigin) return 'block-cross-origin';
  if (!['GET', 'HEAD'].includes(String(method).toUpperCase())) return 'block-write';
  return 'allow';
}

export function verifiedScore(summary) {
  return !!summary &&
    Number.isInteger(summary.botProbability) &&
    summary.botProbability >= 0 && summary.botProbability <= 100 &&
    Number.isInteger(summary.testsRun) && summary.testsRun > 0 &&
    Number.isInteger(summary.testsTotal) && summary.testsTotal >= summary.testsRun;
}
