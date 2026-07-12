# Scrutari Submission & Classification Endpoint

## Architecture

```
┌─────────────────┐     /api/classify (Edge)    ┌──────────────────────────┐
│  Scrutari SPA    │ ──────────────────────────▶ │ Netlify Edge Function    │
│  (browser)       │                             │ • GeoIP (context.geo)    │
│                  │     /api/submit (Function)  │ • Tor exit check         │
│                  │ ──────────────────────────▶ │ • IP classification      │
│                  │                             └──────────────────────────┘
│                  │     /benchmarks.json             │
│                  │ ◀────────────────────────── Static file
└─────────────────┘
```

## Endpoints

| Endpoint | Type | Free tier | Purpose |
|----------|:----:|:---------:|---------|
| `/api/classify` | Edge Function | 1M req/mo | GeoIP + IP classification (replaces ipinfo.io) |
| `/api/submit` | Serverless Function | 125K req/mo | Fingerprint submission + dedup storage |
| `/benchmarks.json` | Static | Unlimited | Pre-computed Bot-or-Not benchmarks |
| `/` | Static | Unlimited | SPA served via CDN |

## GeoIP Edge Function (`/api/classify`)

Uses Netlify's built-in geolocation (`context.geo`) — no third-party API calls.

**Before (ipinfo.io):**
```
SPA → ipinfo.io (3rd party) → user IP exposed to external service
```

**After (Netlify Edge):**
```
SPA → Netlify Edge (same CDN) → no external data sharing
```

### Response:
```json
{
  "ip": "203.0.113.42",
  "country": "DE",
  "region": "BE",
  "city": "Berlin",
  "loc": "52.52,13.405",
  "timezone": "Europe/Berlin",
  "org": "AS24940 Hetzner",
  "type": "Datacenter",
  "risk": "medium"
}
```

### Features:
- **GeoIP**: Country, region, city, coordinates, timezone (from CDN request, no DB needed)
- **Tor exit detection**: Fetches Tor exit list, caches for 1 hour, checks client IP
- **IP classification**: Datacenter, VPN, or residential (from ASN/org when available)
- **Privacy**: No data sent to third parties; classification happens at the edge

## Submission Function (`/api/submit`)

See "Research Methodology" below for the deduplication strategy.

## Research Methodology

### Storage Design: Deduplication with Frequency Counters

Instead of storing every submission raw (which consumes blob storage linearly), we store:

```
┌──────────────────────────────────────────┐
│  store.json (Netlify Blob)               │
│                                          │
│  {                                        │
│    totalSubmissions: 10000,              │
│    uniqueFingerprints: 9500,             │
│    fingerprints: {                        │
│      "a1b2c3d4...": {                    │
│        count: 3,                         │ ← frequency counter
│        firstSeen: "2026-07-12",          │
│        lastSeen: "2026-07-14",           │
│        fp: { screenClass, gpuClass, ... }│ ← stored once
│      },                                   │
│      ...                                  │
│    },                                     │
│    distributions: {                       │ ← pre-computed
│      screenClass: { "Full HD": 4700 },   │
│      gpuClass: { "intel": 3500 },        │
│      ...                                  │
│    }                                      │
│  }                                        │
└──────────────────────────────────────────┘
```

**Why this is better for research:**

| Need | Raw submissions | Dedup + counters |
|------|:---------------:|:----------------:|
| Entropy estimation | Need frequency counts | ✅ Counters ARE frequencies |
| K-anonymity | Need group sizes | ✅ Counters ARE group sizes |
| Fingerprint stability | Need timestamps | ✅ firstSeen/lastSeen per FP |
| Marginal distributions | Need aggregation query | ✅ Pre-computed O(1) |
| Scientific reproducibility | All raw data | ✅ Counters preserve distribution |
| Storage efficiency | O(N) | **O(unique fingerprints)** |

### Sample Size Requirements

| Analysis | Min samples | Ideal | At 100/day |
|----------|:-----------:|:-----:|:----------:|
| Per-attribute entropy | 1,000 | 10,000 | ~3 months |
| Fingerprint k-anonymity | 5,000 | 50,000 | ~1 year |
| Longitudinal stability | 10K over months | 100K | ~2 years |

### Blob Lifecycle

```
                    ┌──────────────────────┐
                    │  Netlify Blob (1GB)   │
                    │  Dedup store.json     │
                    └──────────┬───────────┘
                               │
                  When store reaches 800MB:
                               │
                    ┌──────────▼───────────┐
                    │ Archive to JSONL     │
                    │ Download via dashboard│
                    │ Reset store          │
                    └──────────────────────┘
```

At ~500 bytes per unique fingerprint + distributions:
- **1GB** = ~2M unique fingerprints = **~2 years** of daily data
- Auto-archives at 800MB, resets, continues collecting

### Response Stats

Each submission returns research stats:
```json
{
  "stats": {
    "totalSubmissions": 10000,
    "uniqueFingerprints": 9500,
    "dedupRatio": "5.0%",
    "maxFingerprintFrequency": 7,
    "marginalEntropyBits": 14.2,
    "blobSizeKB": 4800
  }
}
```

## Deploy

```bash
bash submit-endpoint/deploy-netlify.sh --new
```

This creates a Netlify site, enables Blob Storage, and deploys both functions.

### Configure SPA

```js
// In browser console after deployment:
localStorage.setItem('scrutari_endpoint', 'https://YOUR-SITE.netlify.app/api/submit');
localStorage.setItem('scrutari_classify', 'https://YOUR-SITE.netlify.app/api/classify');
```

## Data Privacy

| What | Stored? | Details |
|------|:-------:|---------|
| Raw IP | ❌ | SHA-256 hashed for rate limiting only |
| Cookies / PII | ❌ | Never collected |
| Fingerprint values | ✅ | Deduplicated with frequency counter |
| User IP for classify | ❌ | Used at edge, never stored |
| User agent | ❌ | Not stored (fingerprint captures browser signals) |
| Timestamps | ✅ | First seen, last seen per unique fingerprint |
| Source label | ✅ | `manual` vs `automation_baseline` |
