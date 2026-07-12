const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3456;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const RATE_LIMIT_MS = process.env.RATE_LIMIT_MS ? parseInt(process.env.RATE_LIMIT_MS) : 5000;

fs.mkdirSync(DATA_DIR, { recursive: true });

// Simple rate limiter: per-IP tracking
const recent = new Map();
setInterval(() => recent.clear(), 60000); // clear every minute

function rateLimit(ip) {
  const now = Date.now();
  const last = recent.get(ip);
  if (last && now - last < RATE_LIMIT_MS) return false;
  recent.set(ip, now);
  return true;
}

// Validate submission schema
function validate(data) {
  if (!data || typeof data !== 'object') return 'Invalid JSON body';
  if (!data.version || typeof data.version !== 'number') return 'Missing version';
  if (data.botScore !== undefined && (typeof data.botScore !== 'number' || data.botScore < 0 || data.botScore > 100)) return 'Invalid botScore';
  if (data.source && !['manual', 'automation_baseline'].includes(data.source)) return 'Invalid source';
  return null;
}

function getDailyFile() {
  const date = new Date().toISOString().split('T')[0];
  return path.join(DATA_DIR, `submissions-${date}.jsonl`);
}

function anonymizeIP(ip) {
  // Hash IP for dedup without storing raw IP
  return crypto.createHash('sha256').update(ip + 'scrutari-salt').digest('hex').substring(0, 16);
}

const server = http.createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed. Use POST.' }));
    return;
  }

  if (req.url !== '/submit') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found. POST to /submit' }));
    return;
  }

  // Rate limit
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
  if (!rateLimit(ip)) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Rate limited. Wait before submitting again.' }));
    return;
  }

  // Collect body
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    try {
      const data = JSON.parse(body);
      const validationError = validate(data);
      if (validationError) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: validationError }));
        return;
      }

      // Add server-side metadata
      data._received = new Date().toISOString();
      data._ipHash = anonymizeIP(ip);
      data._userAgent = req.headers['user-agent'] || 'unknown';

      // Append to daily JSONL file
      const dailyFile = getDailyFile();
      fs.appendFileSync(dailyFile, JSON.stringify(data) + '\n', 'utf-8');

      // Basic stats
      const stats = { total: 0, today: 0, baseline: 0, manual: 0 };
      try {
        const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.jsonl'));
        stats.total = files.reduce((sum, f) => {
          const lines = fs.readFileSync(path.join(DATA_DIR, f), 'utf-8').trim().split('\n').filter(Boolean);
          return sum + lines.length;
        }, 0);
        // Today's count
        const todayLines = fs.existsSync(dailyFile) ? fs.readFileSync(dailyFile, 'utf-8').trim().split('\n').filter(Boolean) : [];
        stats.today = todayLines.length;
        stats.baseline = todayLines.filter(l => l.includes('"automation_baseline"')).length;
        stats.manual = todayLines.filter(l => l.includes('"manual"')).length;
      } catch(e) {}

      console.log(`[${new Date().toISOString()}] Submission from ${data.source || 'unknown'}: ${data.botScore !== undefined ? data.botScore + '% bot' : 'no score'} (total: ${stats.total})`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        message: 'Submission recorded. Thank you for contributing to research!',
        stats
      }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON: ' + e.message }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`Scrutari Submission Endpoint running on http://0.0.0.0:${PORT}`);
  console.log(`POST /submit — accepts anonymized fingerprint data`);
  console.log(`Data directory: ${DATA_DIR}`);
  console.log(`Rate limit: ${RATE_LIMIT_MS}ms per IP`);
});
