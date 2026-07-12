# Scrutari Submission Endpoint

Receives anonymized browser fingerprint submissions from the Scrutari SPA.

## Deploy Options

### Option 1: Docker (recommended — run anywhere)

```bash
docker build -t scrutari-submit .
docker run -d --name scrutari-submit -p 3456:3456 -v $(pwd)/data:/app/data scrutari-submit
```

Data is stored as daily JSONL files in `./data/submissions-YYYY-MM-DD.jsonl`.

Configure the SPA to use your endpoint:
```js
// In browser console:
localStorage.setItem('scrutari_endpoint', 'http://YOUR_SERVER_IP:3456/submit');
```

### Option 2: Netlify

```bash
# 1. Install Netlify CLI
npm install -g netlify-cli

# 2. Deploy
cd netlify
netlify deploy --prod
```

Requires Netlify Blob Storage (free: 1GB, enabled on all sites).

### Option 3: Cloudflare Workers

Copy `netlify/functions/submit.mjs`, adapt KV bindings. Free tier: 100k req/day.

## API

### POST /submit

**Request:**
```json
{
  "version": 1,
  "botScore": 48,
  "botConfidence": "High",
  "source": "manual",
  "screenClass": "Full HD",
  "hasWASM": true,
  "fontCount": 12,
  "gpuClass": "intel",
  "tzRegion": "America",
  "submitted": "2026-07-12"
}
```

**Response:**
```json
{
  "status": "ok",
  "message": "Submission recorded. Thank you for contributing to research!",
  "stats": {
    "total": 142,
    "today": 7,
    "baseline": 3,
    "manual": 4
  }
}
```

## Data Privacy

- Raw IPs are never stored. Only a SHA-256 hash is kept for rate limiting.
- No cookies, no personal identifiers, no tracking.
- User agent is stored as a browser fingerprint signal, not for identification.
- Data is publicly available for research (intended for k-anonymity analysis).
