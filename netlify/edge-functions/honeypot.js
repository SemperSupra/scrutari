// Netlify Edge Function: Bot Honeypot
// Hidden links that bots crawl but humans never see.
// Captures bot fingerprints for research data.
//
// How it works:
//   1. SPA contains hidden links (display:none) that only bots/scrapers find
//   2. When visited, this function classifies the visitor
//   3. Records browser signals from HTTP headers
//   4. Returns a convincing fake page to keep the bot engaged
//
// Honeypot paths (defined in netlify.toml redirects):
//   /admin/         — fake admin panel
//   /.env           — fake environment file
//   /wp-admin/      — WordPress attack target
//   /backup/        — fake backup directory
//   /api/health     — fake health endpoint

const HONEYPOT_PATHS = ['/admin/', '/.env', '/wp-admin/', '/backup/', '/api/health'];

function classifyBot(ua) {
  if (!ua) return { isBot: true, type: 'unknown', score: 100 };
  const lower = ua.toLowerCase();
  if (lower.includes('googlebot') || lower.includes('googlebot')) return { isBot: true, type: 'search_engine', score: 100 };
  if (lower.includes('bingbot') || lower.includes('bingpreview')) return { isBot: true, type: 'search_engine', score: 100 };
  if (lower.includes('slurp') || lower.includes('yandex')) return { isBot: true, type: 'search_engine', score: 100 };
  if (lower.includes('duckduckbot') || lower.includes('baiduspider')) return { isBot: true, type: 'search_engine', score: 100 };
  if (lower.includes('curl') || lower.includes('wget') || lower.includes('python')) return { isBot: true, type: 'http_client', score: 100 };
  if (lower.includes('scrapy') || lower.includes('httpclient')) return { isBot: true, type: 'scraper', score: 100 };
  if (lower.includes('headless') || lower.includes('phantom')) return { isBot: true, type: 'headless_browser', score: 85 };
  return { isBot: false, type: 'unknown', score: null };
}

function getFakePage(path) {
  const pages = {
    '/admin/': `<!DOCTYPE html><html><head><title>Admin Panel</title><meta name="robots" content="noindex"></head>
<body style="background:#1a1a2e;color:#eee;font-family:sans-serif;padding:2rem;">
<h1>Dashboard</h1><p>Loading...</p>
<script>setTimeout(function(){document.querySelector('p').textContent = 'Session expired. Redirecting...';}, 2000);</script>
</body></html>`,

    '/.env': `DB_HOST=localhost
DB_USER=admin
DB_PASS=s3cr3t
API_KEY=sk-xxxxxxxxxxxxxxxxxxxx
SECRET=production_value_do_not_commit`,

    '/wp-admin/': `<!DOCTYPE html><html><head><title>WordPress Login</title></head>
<body style="background:#f0f0f1;font-family:sans-serif;">
<div style="max-width:320px;margin:auto;margin-top:100px;padding:20px;background:white;border:1px solid #ccc;">
<h1 style="font-size:20px;">WordPress</h1>
<form><input type="text" placeholder="Username" style="width:100%;padding:8px;margin:4px 0;">
<input type="password" placeholder="Password" style="width:100%;padding:8px;margin:4px 0;">
<button style="width:100%;padding:8px;background:#2271b1;color:white;border:none;">Log In</button></form>
</div></html>`,

    '/backup/': `<!DOCTYPE html><html><head><title>Directory listing</title></head>
<body><h1>Index of /backup/</h1><hr>
<pre>
<a href="db_backup_2026-07-12.sql">db_backup_2026-07-12.sql</a>          1.2G
<a href="config_backup.tar.gz">config_backup.tar.gz</a>             45M
<a href="users_export.csv">users_export.csv</a>                 2.8M
</pre></body></html>`,

    '/api/health': JSON.stringify({ status: 'ok', uptime: '72d', version: '2.4.1', db: 'connected' }),
  };
  return pages[path] || pages['/admin/'];
}

export default async (req, context) => {
  const url = new URL(req.url);
  const path = url.pathname;

  if (!HONEYPOT_PATHS.includes(path)) {
    return new Response('Not found', { status: 404 });
  }

  // Extract bot signals from the request
  const ua = req.headers.get('user-agent') || 'unknown';
  const classification = classifyBot(ua);
  const clientIP = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
                || req.headers.get('x-nf-client-connection-ip')
                || 'unknown';

  // Build fingerprint from available HTTP headers (limited compared to JS-based)
  const httpFingerprint = {
    source: 'honeypot',
    botScore: classification.score,
    botConfidence: classification.isBot ? 'High' : 'Low',
    detectorVersion: 1,
    engine: ua.includes('Chrome') ? 'V8/Blink' : ua.includes('Firefox') ? 'Gecko' : ua.includes('Safari') ? 'WebKit' : 'unknown',
    screenClass: null, // Can't detect without JS
    hasWASM: null,     // Can't detect without JS
    _capturedAt: new Date().toISOString(),
    _honeypotPath: path,
    _classification: classification.type,
    _userAgent: ua.substring(0, 150),
  };

  // Log the capture
  console.log(`[Honeypot] ${classification.type} on ${path} from ${clientIP}: ${ua.substring(0, 60)}`);

  // Try to store to blob (silent fail if not available)
  try {
    const store = context.env.STORE;
    if (store) {
      const key = 'honeypot-captures';
      let captures = [];
      try {
        const raw = await store.get(key, { type: 'json' });
        if (Array.isArray(raw)) captures = raw;
      } catch {}
      captures.push(httpFingerprint);
      // Keep only last 1000 captures
      if (captures.length > 1000) captures = captures.slice(-1000);
      await store.set(key, captures);
    }
  } catch (e) {
    // Blob storage not available — log only
  }

  // Return a convincing fake page
  const page = getFakePage(path);
  const contentType = path === '/.env' ? 'text/plain' : path === '/api/health' ? 'application/json' : 'text/html';

  return new Response(page, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'X-Robots-Tag': 'noindex, nofollow',
      'Cache-Control': 'no-store',
    }
  });
};
