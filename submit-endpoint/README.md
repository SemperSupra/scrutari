# Scrutari Submission Endpoint

Receives anonymized browser fingerprint submissions from the Scrutari SPA.
Part of the Scrutari research project to build a public k-anonymity dataset.

## Architecture

```
┌──────────────┐     POST /submit     ┌──────────────────┐
│  Scrutari SPA │ ──────────────────▶  │  Submission API   │
│  (browser)    │     anonymized      │  (any backend)    │
└──────────────┘     fingerprint      └──────────────────┘
                                             │
                                    ┌────────┴────────┐
                                    │   Data Store     │
                                    │ JSONL / Blob / KV│
                                    └─────────────────┘
```

## Deploy Options (free tier available)

### Option 1: Docker (recommended — full control, no rate limits)

Build and run anywhere — TrueNAS, VPS, local:

```bash
docker build -t scrutari-submit submit-endpoint/
docker run -d --name scrutari-submit \
  -p 3456:3456 \
  -v $(pwd)/data:/app/data \
  scrutari-submit
```

**Verify:**
```bash
curl -X POST http://localhost:3456/submit \
  -H 'Content-Type: application/json' \
  -d '{"version":1,"source":"test","botScore":50,"submitted":"2026-07-12"}'
```

**Configure SPA:**
```js
localStorage.setItem('scrutari_endpoint', 'http://YOUR_SERVER_IP:3456/submit');
```

Data: `./data/submissions-YYYY-MM-DD.jsonl` (daily files, append-only)

---

### Option 2: Netlify + Blob Storage (1GB free, 1M req/mo)

**Automated deploy:**
```bash
bash submit-endpoint/deploy-netlify.sh --new
```

This script:
1. Checks Netlify CLI
2. Logs you in (opens browser for OAuth — one-time)
3. Creates a new Netlify site
4. Enables Blob Storage
5. Deploys the function
6. Prints your endpoint URL

**Manual deploy:**
```bash
cd submit-endpoint/netlify
npx netlify login                    # one-time browser auth
npx netlify sites:create --name scrutari-submit
npx netlify blob:enable              # enable blob storage
npx netlify deploy --prod --functions functions --dir .
```

**Configure SPA:**
```js
localStorage.setItem('scrutari_endpoint', 'https://YOUR-SITE.netlify.app/api/submit');
```

**Data access (via Netlify Blob dashboard):**
- Login to https://app.netlify.com
- Select your site → Functions → Blob Storage
- Download `scrutari-submissions.json`

---

### Option 3: Cloudflare Workers (100k req/day free)

Copy `netlify/functions/submit.mjs` and adapt for Workers KV:
- KV namespace capacity: 1GB free
- 100k reads/day, 1k writes/day

---

## API Specification

### POST /api/submit (Netlify) or POST /submit (Docker)

**Request body:**
```json
{
  "version": 1,
  "botScore": 48,
  "botConfidence": "High",
  "source": "manual",
  "screenClass": "Full HD",
  "hasWASM": true,
  "hasWebGL": true,
  "hasCanvas": true,
  "hasAudio": true,
  "fontCount": 12,
  "gpuClass": "intel",
  "tzRegion": "America",
  "cpuCores": "medium",
  "deviceMemory": "medium",
  "darkMode": true,
  "engine": "V8/Blink",
  "adblockDetected": false,
  "totalEntropyBits": 28.5,
  "submitted": "2026-07-12"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | number | ✅ | Schema version (currently 1) |
| `source` | string | ❌ | `manual` or `automation_baseline` |
| `botScore` | number | ❌ | 0-100 Bot-or-Not score |
| `botConfidence` | string | ❌ | `High`, `Medium`, `Low` |
| `screenClass` | string | ❌ | Bucketed resolution: `Full HD`, `4K+`, etc. |
| `hasWASM` | boolean | ❌ | WebAssembly support |
| `fontCount` | number | ❌ | Number of detected fonts (bucketed) |
| `gpuClass` | string | ❌ | `nvidia`, `amd`, `intel`, `apple`, `software`, `other` |
| `tzRegion` | string | ❌ | Timezone region: `America`, `Europe`, `Asia`, etc. |
| `cpuCores` | string | ❌ | `low` (1-2), `medium` (4-8), `high` (16+) |
| `deviceMemory` | string | ❌ | `low` (≤4GB), `medium` (8GB), `high` (16GB+) |
| `engine` | string | ❌ | `V8/Blink`, `JSC`, `Gecko`, etc. |
| `adblockDetected` | boolean | ❌ | Adblock presence |

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

| What | Stored? | Details |
|------|:-------:|---------|
| Raw IP | ❌ No | SHA-256 hashed for rate limiting only |
| IP hash | ✅ Partial | First 16 hex chars of hash (non-reversible) |
| User Agent | ✅ Yes | Browser fingerprint signal, truncated to 100 chars |
| Cookies | ❌ No | Never collected |
| Personal IDs | ❌ No | Schema explicitly excludes them |
| Timestamp | ✅ Yes | Date only in submission; full ISO on server receipt |
| Geolocation | ❌ No | Only timezone region (e.g., "America") |

## Rate Limiting

- **Docker**: 5 seconds between submissions per IP
- **Netlify**: 1 request per second per IP (default)
- Both return HTTP 429 when rate limited
