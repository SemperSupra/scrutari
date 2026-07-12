# Scrutari Submission Endpoint

Anonymized browser fingerprint collection for k-anonymity research.

## Research Methodology

### Storage Design

Instead of storing every submission raw (prohibitive), we use **deduplication with frequency counters**:

```
Submission #1: fingerprint A → store A, count=1
Submission #2: fingerprint A → increment count=2
Submission #3: fingerprint B → store B, count=1
...
Result: 100K submissions → ~95K unique fingerprints + 5K duplicates
         Storage: ~50MB instead of ~50MB (same at high uniqueness)
```

**Why dedup is better for research than raw storage:**

| Need | Raw submissions | Dedup + counters |
|------|:---------------:|:----------------:|
| Entropy estimation | Need frequency counts | ✅ Counters ARE frequencies |
| K-anonymity | Need group sizes | ✅ Counters ARE group sizes |
| Fingerprint stability | Need timestamps per fingerprint | ✅ firstSeen/lastSeen |
| Marginal distributions | Need to aggregate | ✅ Pre-computed |
| Scientific reproducibility | All raw data | ✅ Counters preserve distribution |
| Storage efficiency | O(N) | **O(unique fingerprints)** |

### Sample Size Requirements

| Analysis | Min samples | Ideal | Time to collect (est.) |
|----------|:-----------:|:-----:|:----------------------:|
| Per-attribute entropy (rough) | 1,000 | 10,000 | Days |
| Full fingerprint entropy (stable) | 10,000 | 100,000 | Weeks |
| K-anonymity distributions | 5,000 | 50,000 | Weeks |
| Longitudinal stability | N/A | 10,000+ over months | Months |

At ~100 submissions/day (realistic for a niche tool), we reach statistical significance in:
- 3 months for fingerprint entropy
- 6 months for k-anonymity distributions
- 1+ year for longitudinal trends

### Data Quality Controls

| Signal | Issue | Mitigation |
|--------|-------|------------|
| Source bias | Self-selection (privacy-conscious users) | Document in methodology; weight by source |
| Automation contamination | Bots submitting fingerprints | `source: automation_baseline` label |
| Duplicate bias | Same browser submitting multiple times | Per-fingerprint counters capture frequency |
| Temporal bias | More submissions from certain timezones | Track submission timestamps by day |
| Sample independence | Multiple submissions from same browser | Acceptable — frequency IS the signal |

### Entropy Calculation

The endpoint computes **marginal entropy** (per-attribute Shannon entropy) on each submission:

```
H(X) = -Σ p(x) × log₂(p(x))
```

Where `p(x)` is the frequency of attribute value `x` across all submissions.

**Limitation**: This ignores pairwise correlations between attributes (e.g., screen size ↔ GPU class). True joint entropy is lower. The 2024 Google study found correlations reduce effective entropy by ~30%.

**Research output**: The blob store contains everything needed for:
- Shannon entropy per attribute
- K-anonymity (count of browsers sharing each fingerprint)
- Browser engine distribution
- Adblock/adoption rates
- Longitudinal trends (from firstSeen/lastSeen)

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

The dedup approach means 1GB stores:
- **95K unique fingerprints** at 500 bytes each + distributions = ~50MB
- At 100 submissions/day × 95% uniqueness = 95 unique/day
- **~2.7 years** of data before hitting 1GB

## Deploy Options

### Docker (recommended)

```bash
docker build -t scrutari-submit submit-endpoint/
docker run -d --name scrutari-submit \
  -p 3456:3456 \
  -v $(pwd)/data:/app/data \
  scrutari-submit
```

Auto-archives at 800MB: copies store to `store-archive-YYYY-MM-DD.jsonl` and resets.

### Netlify (serverless)

```bash
bash submit-endpoint/deploy-netlify.sh --new
```

Blob storage auto-scales. Download data from Netlify dashboard → Functions → Blob Storage.

## API

### POST /api/submit (Netlify) or POST /submit (Docker)

**Request:** Fingerprint attributes (version, screenClass, gpuClass, tzRegion, etc.)

**Response:**
```json
{
  "status": "ok",
  "submission": "#142",
  "isDuplicate": false,
  "stats": {
    "totalSubmissions": 142,
    "uniqueFingerprints": 138,
    "dedupRatio": "2.8%",
    "maxFingerprintFrequency": 3,
    "marginalEntropyBits": 14.2,
    "blobSizeKB": 68
  }
}
```

## Data Privacy

| What | Stored? | Details |
|------|:-------:|---------|
| Raw IP | ❌ | SHA-256 hashed for rate limiting |
| Cookies / PII | ❌ | Never collected |
| Fingerprint values | ✅ | Deduplicated with frequency counter |
| User agent | ❌ | Not stored (fingerprint captures browser signals) |
| Timestamps | ✅ | First seen, last seen per unique fingerprint |
| Source label | ✅ | `manual` vs `automation_baseline` |
