# Scrutari Scalability Audit

**Date:** 2026-07-15
**Scope:** Full system — SPA, Netlify serverless/edge functions, Docker endpoint, ML pipeline, storage layer
**Baseline:** 6 submissions, 5 unique fingerprints, 10 distribution attributes
**Tests:** 126 passing

---

## Executive Summary

Scrutari's architecture is appropriate for its current research scale (<100 submissions/day), but has **6 systemic scalability bottlenecks** that will limit growth beyond ~10K submissions or ~100 concurrent users. The SPA and edge functions scale infinitely (CDN-delivered static content). The bottlenecks are in **data access patterns** (linear scans on every analysis request), **stateless rate limiting** (per-container only), **synchronous I/O** (Docker endpoint), and **ML training** (no incremental learning).

---

## 1. Current Scaling Characteristics

| Subsystem | Scales To | Bottleneck | Mitigation Status |
|-----------|:---------:|------------|:-----------------:|
| **SPA** (static) | ∞ (CDN) | None | ✅ Already scales |
| **Edge Functions** | 2M req/month | 50ms CPU limit | ✅ Fine for current use |
| **Serverless Functions** (submit) | 125K req/month, O(1) per req | None after per-key blob fix | ✅ Fixed (Item B) |
| **Serverless Functions** (analysis) | 100-1K fingerprints | O(n) scan for confusion matrix | ⬜ Not addressed |
| **Serverless Functions** (challenge) | 125K req/month | In-memory Map (per-container) | ⬜ Not addressed |
| **Serverless Functions** (status) | 125K req/month | O(1), trivial | ✅ Fine |
| **Docker Endpoint** | ~10 concurrent | StoreMutex serializes writes | ⬜ Not addressed |
| **Netlify Blob** | 1GB / 1M ops/month | List operation cost | ⬜ Not addressed |
| **ML Training** | ~1K samples | Full retrain each week, single core | ⬜ Not addressed |
| **Rate Limiter** | Per-container only | Multiple containers = inconsistent state | ⬜ Not addressed |

---

## 2. Detailed Bottleneck Analysis

### 2.1 Analysis Dashboard — O(n) Fingerprint Scan — Medium

**Current behavior:** `analysis.mjs` reads the `idx` key (all fingerprint hashes), then fetches each individual `fp:<hash>` to compute the confusion matrix and time range. At 10K fingerprints, this is 10K+ blob read operations per analysis request.

**Impact:**
- At 1K fingerprints: ~100 reads, ~500ms (acceptable)
- At 10K fingerprints: ~10K reads, ~5-10s (approaching timeout)
- At 100K fingerprints: ~100K reads, ~50s+ (will timeout)

**Mitigation already in place:** The analysis endpoint samples only the first 1,000 fingerprints (`MAX_SAMPLE = 1000`). This is a stop-gap — the confusion matrix and time range are computed from a sample, not the full dataset.

### 2.2 No Analysis Caching — Medium

**Current behavior:** Every `GET /api/analysis` recomputes the full analysis from scratch. The analysis data changes only when new submissions arrive.

**Impact:** Unnecessary recomputation. For a dashboard that's refreshed every few seconds, each refresh triggers 100+ blob reads.

### 2.3 Rate Limiter — Per-Container Only — Low-Medium

**Current behavior:** The rate limiter uses an in-memory `Map` (`_rateWindows`). Netlify's serverless architecture runs multiple concurrent containers, each with its own rate limiter state.

**Impact:** A client sending 5 rapid requests may hit 5 different containers, each allowing 1 request = 5 total allowed instead of 1. This is acceptable for research spam prevention but not for rate limiting as a security control.

**Industry practice:** Distributed rate limiting uses Redis or DynamoDB for shared state. Netlify doesn't natively support Redis, but has a Blob-based or Edge-based alternative.

### 2.4 Docker Endpoint — Synchronous I/O + Mutex — Low

**Current behavior:** `server.js` uses `fs.readFileSync` and `fs.writeFileSync` with a `StoreMutex` that serializes all write operations. Under load (>10 concurrent requests), throughput is bounded by disk I/O.

**Impact:** At current traffic levels (near zero for the Docker endpoint), this is irrelevant. At 100 concurrent submissions/second, throughput caps at ~50 writes/second due to synchronous I/O + mutex.

### 2.5 ML Training — Full Retrain, Single Core — Low

**Current behavior:** `train_model.py` trains a Random Forest from scratch on every invocation using one CPU core (`n_jobs` unset, defaults to 1).

**Impact:** At 1K samples, training takes ~5 seconds (trivial). At 100K samples, training takes ~10+ minutes. The weekly scheduler becomes a progressive time sink.

### 2.6 No Data Export — Low

**Current behavior:** Research data is stored in Netlify Blob with no export mechanism. Analysis can only be done via the `/api/analysis` endpoint or by directly reading the blob.

**Impact:** Researchers cannot run their own analysis in Python/R. Data is effectively trapped in the Netlify ecosystem.

---

## 3. Capacity Planning

### 3.1 Projected Growth

| Timeframe | Submissions | Fingerprints | Blob Size | Analysis Time (est.) | ML Train Time (est.) |
|:---------:|:-----------:|:------------:|:---------:|:--------------------:|:--------------------:|
| Now | 6 | 5 | ~3 KB | ~100ms | ~2s |
| 1 month | 300 | 250 | ~150 KB | ~200ms | ~2s |
| 6 months | 5K | 4K | ~2 MB | ~500ms | ~3s |
| 1 year | 50K | 40K | ~20 MB | ~5s | ~10s |
| 2 years | 500K | 400K | ~200 MB | ~50s ❌ | ~2min ❌ |

**Analysis endpoint will be the first to break** (~1 year at current collection rate), followed by ML training (~2 years).

### 3.2 Netlify Free Tier Limits

| Resource | Limit | Projected Exhaustion |
|----------|:-----:|:--------------------:|
| Function invocations | 125K/month | ~3 years at 100 submissions/day |
| Edge function requests | 2M/month | ~10+ years |
| Blob storage | 1 GB | ~5 years at 100 fingerprints/day |
| Blob reads | 1M/month | ~2 years (analysis endpoint heavy) |
| Blob writes | 1M/month | ~27 years at 100 submissions/day |

**First limit to hit:** Blob reads at ~2 years, driven by the analysis endpoint reading all fingerprints on every request.

---

## 4. Formal Tools & Methods for Scalability Checking

| Tool/Method | What It Checks | Cost | Status |
|-------------|---------------|:----:|:------:|
| **k6** (Grafana) | HTTP load testing — concurrent users, RPS, latency percentiles | Free/OSS | ⬜ Not set up |
| **autocannon** (Node.js) | HTTP benchmarking — throughput, latency | Free | ⬜ Not set up |
| **clinic.js** (Node.js) | Event loop lag, GC pressure, hot paths | Free | ⬜ Not set up |
| **Netlify analytics** | Function duration, invocation count, error rate | Included | ✅ Available |
| **Little's Law** (L = λW) | Queue depth estimation for capacity planning | Free | ⬜ Not computed |
| **Universal Scalability Law** | Amdahl's law for parallel speedup ceilings | Free | ⬜ Not modeled |
| **TLA+** (for liveness) | Does the system eventually process all requests? | Free | ⬜ Not applied to scaling |
| **Circuit breaker pattern** | Protects downstream services under load | Design | ⬜ Not implemented |

---

## 5. Actionable Items

Each item includes: recommendation, effort, impact, trade-offs, and alternatives.

---

### Item S1: Analysis Dashboard Caching

**What:** Cache the analysis result in a blob key (`analysis-cache`) and revalidate on write. Every submission triggers cache invalidation. Analysis endpoint reads cache instead of recomputing.

**Effort:** 1-2 hours

**Impact:**
- Eliminates O(n) fingerprint reads for analysis
- Blob reads/month drops from 10K+ per analysis request to 1
- At 100K fingerprints: analysis drops from ~50s to ~10ms

**Trade-offs:**
- Stale cache if submission fails to invalidate (acceptably rare)
- Cache invalidation adds ~100ms to submission write path
- Two analysis requests in the same millisecond may both compute (race window)

**Alternatives:**
1. ✅ **Recommended:** Write-through cache (update on submission, read from cache)
2. Set-and-forget with TTL (simpler, but accepts staleness)
3. No caching (current behavior, breaks at ~1 year)

**Decision:** [ ] Ignore [ ] Implement [x] **Recommend: Implement**

---

### Item S2: Rate Limiter with Blob-Backed State

**What:** Use Netlify Blob as a shared rate-limiter state instead of in-memory `Map`. Each request reads/writes a `ratelimit:<ip>` key with the timestamp window. Accepts O(blob-read) latency per request.

**Effort:** 2-3 hours

**Impact:**
- Consistent rate limiting across all containers
- Prevents bypass via round-robin container scheduling
- Adds ~10ms blob read/write per request

**Trade-offs:**
- Blob writes are slower than in-memory Map (~10ms vs ~0.01ms)
- Blob write costs (1M/month free — at 100 req/day, trivial)
- Race condition: two simultaneous requests from same IP may both pass (narrow window)

**Alternatives:**
1. ✅ **Recommended:** Blob-backed rate limiter with relaxed consistency (eventually consistent is fine for spam prevention)
2. Edge function rate limiting (Netlify's built-in edge rate limiting, but requires paid plan)
3. Keep in-memory only (adequate for research scale, inconsistent across containers)

**Decision:** [ ] Ignore [x] **Recommend: Implement** [ ] Defer

---

### Item S3: Data Export Endpoint

**What:** Add `GET /api/export` that returns all fingerprint data as newline-delimited JSON (NDJSON) for analysis in Python/R. Include pagination with cursor-based iteration.

**Effort:** 1-2 hours

**Impact:**
- Enables external analysis (R, Jupyter, scikit-learn)
- Future-proofs data portability
- Supports the ML pipeline with real data instead of SapiMouse pre-training

**Trade-offs:**
- Export of all data is O(n) — large exports may timeout
- Pagination (cursor-based) mitigates timeout risk
- Must respect the auth key (same as analysis endpoint)

**Alternatives:**
1. ✅ **Recommended:** NDJSON export with cursor pagination
2. CSV export (lossy for nested fingerprint data)
3. Direct blob access (requires Netlify credentials, not portable)

**Decision:** [ ] Ignore [ ] Implement [x] **Recommend: Implement**

---

### Item S4: ML Training — Parallel Cores

**What:** Add `n_jobs=-1` to `RandomForestClassifier()` so training uses all available CPU cores.

**Effort:** 5 minutes

**Impact:** Training time drops from O(n_samples × n_trees / 1 core) to O(n_samples × n_trees / n_cores). On a 4-core container, 4× speedup.

**Trade-offs:** None meaningful. `n_jobs=-1` is the industry standard for single-container training jobs.

**Alternatives:** Only one approach needed.

**Decision:** [ ] Ignore [x] **Recommend: Implement** [ ] Defer

---

### Item S5: ML Training — Incremental / Warm-Start

**What:** Set `warm_start=True` on the Random Forest and save the model between training runs. Each weekly training adds `n_estimators` incrementally instead of retraining from scratch.

**Effort:** 1-2 hours

**Impact:**
- Eliminates full retrain cost
- Training time stays O(Δsamples × Δtrees) instead of O(total_samples × total_trees)
- Model can be updated on-demand without a full pipeline run

**Trade-offs:**
- `warm_start=True` adds trees, doesn't refit existing ones — may not adapt to distribution shift
- Need to balance: add trees vs periodic full retrain
- Model file grows with each incremental update

**Alternatives:**
1. ✅ **Recommended:** `warm_start=True` with periodic full retrain (every 6 months)
2. Partial fit via `RandomForestClassifier.partial_fit()` (not available for RF — only SGD, etc.)
3. Keep full retrain (simple, adequate at current scale)

**Decision:** [ ] Ignore [ ] Implement [x] **Recommend: Defer** — create GitHub issue, implement alongside data export

---

### Item S6: Docker Endpoint — Async I/O + Connection Pooling

**What:** Replace `fs.readFileSync`/`writeFileSync` with `fs.promises` in `server.js`. Already noted in the performance audit (Item G). The StoreMutex remains for write atomicity but no longer blocks the event loop.

**Effort:** 1-2 hours

**Impact:** Under concurrent load, Docker endpoint throughput increases from ~50 writes/second to ~500+ writes/second.

**Trade-offs:** Slightly more complex error handling for async file I/O.

**Alternatives:**
1. ✅ **Recommended:** Async I/O with existing mutex
2. SQLite database (better-sqlite3) — more scalable, but adds dependency
3. Keep synchronous (adequate at current Docker traffic)

**Decision:** [ ] Ignore [x] **Recommend: Implement** [ ] Defer

---

### Item S7: Load Testing Suite

**What:** Add a load testing suite using k6 or autocannon:
- `npm run load-test:submit` — 100 concurrent submissions, measure p50/p95/p99 latency
- `npm run load-test:analysis` — 50 concurrent analysis requests, measure throughput
- `npm run load-test:challenge` — 100 concurrent challenge requests
- Run in CI on a schedule (not on every push — too expensive)

**Effort:** 2-3 hours

**Impact:**
- Quantifies scalability bottlenecks before they cause production issues
- Provides regression detection for performance changes
- Baseline for capacity planning

**Trade-offs:**
- k6 requires a dedicated binary or Docker image
- Load testing against production costs function invocations
- Local load testing (against Docker endpoint) is free

**Alternatives:**
1. ✅ **Recommended:** k6 for the Docker endpoint (local)
2. autocannon (simpler, Node.js native — fewer dependencies)
3. Playwright (already installed, but designed for browser tests not HTTP load)

**Decision:** [ ] Ignore [ ] Implement [x] **Recommend: Defer** — create GitHub issue

---

### Item S8: Analysis Sampling & Pagination

**What:** The current 1,000-fingerprint sample limit is adequate but undocumented. Formalize it: add `?limit=100&offset=200` parameters to the analysis endpoint for paginated exploration. The summary/aggregate data (distributions, trust scores) is always computed from the full dataset; only the fingerprint-level detail is sampled.

**Effort:** 1-2 hours

**Impact:**
- Analysis endpoint remains fast regardless of dataset size
- Enables paginated browsing of fingerprints
- Backward compatible (default limit = 1000 matches current behavior)

**Trade-offs:** Additional URL parameter parsing complexity.

**Alternatives:**
1. ✅ **Recommended:** Cursor-based pagination with `?cursor=<hash>&limit=100`
2. Offset-based pagination (simpler but inconsistent if data changes)
3. Keep current fixed 1,000 sample (adequate for now)

**Decision:** [ ] Ignore [x] **Recommend: Implement** [ ] Defer

---

### Item S9: Rate Limiter — Edge Function Layer

**What:** Add rate limiting at the Netlify Edge (before requests reach serverless functions) using `netlify/edge-functions/rate-limit.js`. The edge function checks `x-forwarded-for` against a blob-backed counter and returns 429 before the request reaches the function layer.

**Effort:** 1-2 days

**Impact:**
- Rate limiting at the network edge, before any compute is consumed
- Protects against DoS without burning function invocations
- Consistent across all containers

**Trade-offs:**
- Edge functions have 50ms CPU limit — the rate limit check must be fast
- Blob reads from edge functions are slower than in-memory
- Adds complexity to the edge function layer

**Alternatives:**
1. ✅ **Recommended:** Defer — implement blob-backed rate limiter in the function layer first (Item S2), then consider edge if function invocation cost becomes an issue
2. Netlify's built-in rate limiting (paid plan feature)
3. Keep per-container rate limiter (adequate for research scale)

**Decision:** [ ] Ignore [ ] Implement [x] **Recommend: Defer** — create GitHub issue

---

### Item S10: Capacity Planning Document

**What:** Create `docs/capacity-planning.md` with:
- Current usage baselines (submissions/day, blob size, function invocations)
- Projected growth model (linear, exponential scenarios)
- Resource exhaustion timeline for each subsystem
- Upgrade triggers (e.g., "upgrade Netlify plan when blob reads exceed 500K/month")

**Effort:** 1 hour

**Impact:**
- Data-driven upgrade decisions instead of reactive
- Budget forecasting for Netlify plan upgrades
- Operations runbook for scaling events

**Trade-offs:** Requires periodic updates to stay accurate.

**Alternatives:**
1. ✅ **Recommended:** Create document, update monthly
2. Dashboard (Grafana + Netlify analytics) — more effort, more useful
3. Informal tracking — adequate at current scale, risky later

**Decision:** [ ] Ignore [ ] Implement [x] **Recommend: Implement**

---

### Item S11: Challenge Store — Blob-Backed

**What:** Move the in-memory `powChallenges` Map in `challenge.mjs` to blob-backed storage. Currently, challenges are stored in-memory and lost when the container recycles (cold start). This means in-flight PoW challenges are invalidated on container restart.

**Effort:** 1-2 hours

**Impact:**
- Challenges survive container restarts
- Consistent challenge state across containers
- Supports horizontal scaling

**Trade-offs:**
- Blob writes add ~10ms latency to challenge issuance
- Challenge TTL cleanup requires a periodic task or TTL-based key naming

**Alternatives:**
1. ✅ **Recommended:** Defer — the current in-memory store is adequate for research scale. Challenge loss on cold start is a minor UX issue (client retries)
2. Blob-backed with TTL in key name (e.g., `challenge:<timestamp>:<hash>`)
3. Keep in-memory (simple, adequate)

**Decision:** [ ] Ignore [ ] Implement [x] **Recommend: Defer** — create GitHub issue

---

## 6. Grouped Implementation Strategy

```
Immediate (P0) — implement this session:
  S1. Analysis dashboard caching     ← prevents first scalability wall (~1 year)
  S4. ML n_jobs=-1                   ← 5-minute fix, 4× training speedup
  S10. Capacity planning document     ← 1-hour doc, enables data-driven decisions

Short-term (P1) — next session:
  S2. Blob-backed rate limiter       ← consistent cross-container rate limiting
  S3. Data export endpoint           ← enables external analysis
  S6. Docker async I/O               ← principled fix, low traffic impact
  S8. Analysis pagination            ← formalizes current sampling behavior

Medium-term (P2) — GitHub issues:
  S5. ML warm_start                   ← incremental learning
  S7. Load testing suite (k6)        ← quantitative scalability baselines
  S9. Edge function rate limiter      ← DoS protection at network edge
  S11. Blob-backed challenge store    ← survives container restarts
```

---

## 7. Summary

| Item | Area | Effort | Impact | Recommendation |
|:----:|:----:|:------:|:------:|:--------------:|
| **S1** | Analysis caching | 1-2h | 🔴 Prevents O(n) scan timeout at ~1yr | **Implement** |
| **S2** | Blob-backed rate limiter | 2-3h | 🟡 Consistent cross-container limiting | **Implement** |
| **S3** | Data export endpoint | 1-2h | 🟡 Enables external analysis | **Implement** |
| **S4** | ML n_jobs=-1 | 5min | 🟢 4× training speedup | **Implement** |
| **S5** | ML warm_start | 1-2h | 🟢 Incremental training | **Defer** (issue) |
| **S6** | Docker async I/O | 1-2h | 🟢 Non-blocking I/O | **Implement** |
| **S7** | Load testing suite | 2-3h | 🟢 Quantitative baselines | **Defer** (issue) |
| **S8** | Analysis pagination | 1-2h | 🟢 Formalized sampling | **Implement** |
| **S9** | Edge rate limiter | 1-2d | 🟡 DoS protection at edge | **Defer** (issue) |
| **S10** | Capacity planning doc | 1h | 🟢 Data-driven decisions | **Implement** |
| **S11** | Blob-backed challenges | 1-2h | 🟢 Survives cold starts | **Defer** (issue) |
