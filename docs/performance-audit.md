# Scrutari Performance & Resource Utilization Audit

**Date:** 2026-07-15
**Scope:** Full system — browser SPA, Netlify serverless/edge functions, Docker endpoint, ML pipeline, storage layer
**Tests passing:** 126 (baseline before any changes)

---

## Executive Summary

Scrutari's architecture is sound for a research platform, but has five systemic performance issues: **(1)** the 544 KB SPA is bloated by 3× code duplication (~360 KB wasted), **(2)** every Netlify function submission reads and writes the entire blob store (~2 KB today, growing unboundedly), **(3)** the fingerprint suite runs entirely on the main thread with no Web Worker offloading, **(4)** there are no performance budgets, benchmarks, or regression tests, and **(5)** third-party fetches (ipinfo.io, ipify.org, test-ipv6.com) block on network latency with no caching.

---

## 1. SPA Performance (index.html)

### 1.1 Code Duplication — Critical

**Finding:** The SPA contains 3 complete copies of the same JavaScript code. Key functions like `captureFingerprint`, `computeBotOrNot`, `renderBotOrNot`, and `displayBehaviorResults` each appear 3 times. The file is 544 KB; a single copy would be ~180 KB.

**Impact:**
- 3× download size → 3× page load latency
- 3× parse/compile time for identical JS → delayed interactivity (Time to Interactive)
- 3× memory usage in the JS heap for duplicate function objects
- Maintenance cost: every change must be applied 3× (currently done via `String.lastIndexOf` in tool scripts)

**Root cause:** The file grew organically with inline `<script>` blocks instead of using module imports. Each copy was added to support a different deployment context, but they were never deduplicated.

### 1.2 No Web Workers — High

**Finding:** All fingerprinting, PoW computation, WebRTC ICE collection, and canvas rendering run on the main thread. The `captureFingerprint` function (executed on DOMContentLoaded) performs:
- Canvas 2D rendering + `toDataURL()` (~65 KB base64 string)
- WebGL parameter queries (6 calls across 3 copies)
- AudioContext creation (3×)
- Font enumeration via DOM measuring
- PoW computation (SHA-256 hashing loop, ~500ms target)
- WebRTC PeerConnection with ICE candidate collection (3s timeout)
- IPv6 connectivity probe (3s timeout per endpoint)
- BigInt performance benchmark

**Impact:** Main thread is blocked for 3-5 seconds during fingerprint collection. The UI becomes unresponsive during this period. User cannot interact, scroll, or click.

**Industry practice:** FingerprintJS v4 uses `requestIdleCallback` for non-critical fingerprint components. AudioContext and canvas fingerprinting can be deferred to idle periods. PoW is the ideal Web Worker candidate.

### 1.3 No Resource Hints — Medium

**Finding:** The SPA has zero resource hints (`<link rel="preload">`, `<link rel="preconnect">`, `<link rel="dns-prefetch">`). External origins (ipinfo.io, api.ipify.org, test-ipv6.com) incur full DNS + TCP + TLS handshake latency.

**Impact:** Each third-party fetch adds ~200-800ms of connection setup time before the actual request starts.

### 1.4 No Deferred/Lazy Loading — Medium

**Finding:** All `<script>` blocks are inline with no `defer` or `async` attribute (they can't have them — they're inline). The entire fingerprint suite executes during `DOMContentLoaded`, blocking initial render.

**Impact:** First Contentful Paint (FCP) is delayed until JS parsing completes. Largest Contentful Paint (LCP) is delayed until fingerprinting finishes.

### 1.5 Excessive DOM Elements — Low

**Finding:** ~1,615 HTML elements in a single page. The behavioral recording UI (dots, flash effects) creates DOM elements via `appendChild` on every interaction, without pooling.

**Impact:** DOM size grows linearly with interaction count. Long interaction sessions may trigger layout thrashing.

---

## 2. Netlify Serverless Function Performance

### 2.1 Full-Body Read-Modify-Write — Critical

**Finding:** `submit.mjs` reads the entire blob store (`store.get(BLOB_NAME, { type: 'json' })`), modifies it in memory, then writes the entire blob back (`store.set(BLOB_NAME, JSON.stringify(db))`). As the dataset grows, this pattern gets progressively slower:

| Fingerprints | Blob Size | Read Time (est.) | Write Time (est.) | Total |
|:------------:|:---------:|:-----------------:|:------------------:|:-----:|
| 100 | ~52 KB | ~10ms | ~10ms | ~20ms |
| 1,000 | ~500 KB | ~50ms | ~50ms | ~100ms |
| 10,000 | ~5 MB | ~300ms | ~300ms | ~600ms |
| 100,000 | ~50 MB | ~2s | ~2s | ~4s |

The per-submission cost grows linearly with the dataset. At 10K+ fingerprints, the function will time out (Netlify serverless limit: 10s for bundled functions, 26s for unbundled).

**Root cause:** The blob store is treated like a single JSON document. The SDK does support per-key granular access, but the code uses a single `scrutari-data` key for the entire database.

### 2.2 No Cold-Start Optimization — Medium

**Finding:** Each function imports `@netlify/blobs` (~3KB gzipped, but triggers module resolution and dependency loading). Netlify functions bundle with esbuild by default, but `@netlify/blobs` has its own dependency chain.

**Impact:** Cold starts add ~200-500ms for module loading. For a function that processes a single submission, this is 20-50% of total execution time.

### 2.3 Unnecessary Serialization — Medium

**Finding:** The `TextEncoder().encode(JSON.stringify(db)).length` check on line 217 encodes the full blob twice — once for size estimation and once for the actual `store.set()` call. `JSON.stringify(db)` is called twice: once for size estimation, once for storage.

**Fix:** Compute size from the stringified value directly:
```js
const dbStr = JSON.stringify(db);
const blobSize = new TextEncoder().encode(dbStr).length;
await store.set(BLOB_NAME, dbStr);
```

### 2.4 No Response Caching — Low

**Finding:** Analysis and status endpoints compute fresh responses on every invocation. The analysis dashboard computes distributions by iterating over the full fingerprint store each time.

**Impact:** As the dataset grows, the analysis endpoint becomes progressively slower. At 100K fingerprints, opening the dashboard would take 10+ seconds.

### 2.5 Distribution Computation — Low

**Finding:** `updateDist()` uses `Object.keys(dist[key]).length` to check cardinality bounds on every call. `Object.keys()` creates a new array allocation each time, which is O(n) in the number of distinct values.

**Impact:** For 100 distributions with 100 values each, this is 10,000 `Object.keys()` calls per submission — negligible at current scale but wasteful.

---

## 3. Docker Endpoint Performance

### 3.1 Synchronous Filesystem I/O — Medium

**Finding:** `server.js` uses `fs.readFileSync` and `fs.writeFileSync` for store operations. While Node.js is single-threaded and synchronous I/O is simpler, it blocks the event loop for the duration of disk I/O.

**Impact:** Under concurrent submission load, each request blocks others during disk reads/writes. The `StoreMutex` prevents data races but serializes all submissions.

### 3.2 Non-Streaming JSON — Low

**Finding:** `server.js` uses `JSON.parse(fs.readFileSync(file, 'utf-8'))` which loads the entire store file into memory as a string, then parses it. For large stores, this doubles peak memory (raw string + parsed object).

### 3.3 Rate Limiter Memory — Low

**Finding:** The sliding window rate limiter stores timestamps in memory (`this._windows = new Map()`). Under sustained attack (e.g., 10K requests/minute from different IPs), the map grows proportionally.

**Impact:** Counterbalanced by 60-second pruning and the fact that rate limiters are ephemeral. Not a concern at expected traffic levels.

---

## 4. ML Pipeline Performance

### 4.1 No Incremental Training — Medium

**Finding:** `train_model.py` trains from scratch on every invocation. There is no checkpoint support, warm-start, or partial-fit capability. Training on 100 samples takes ~2 seconds (trivial), but training on 100K+ samples would take minutes.

**Impact:** The weekly scheduled retrain becomes progressively more expensive. No incremental updates between scheduled runs.

### 4.2 No Early Stopping or Cross-Validation Timing — Low

**Finding:** The Random Forest uses default `n_estimators=100`. `GridSearchCV` or `RandomizedSearchCV` are not used. `n_jobs` is not specified (defaults to 1, using only one core).

**Fix:** `n_jobs=-1` uses all available cores for training, which is a trivially safe change for a single-container ML job.

### 4.3 Single-File Dataset Loading — Low

**Finding:** The training pipeline reads the entire submission dataset at once. For large datasets, streaming or chunked loading would reduce peak memory.

---

## 5. Storage Layer Performance

### 5.1 MemoryStorageAdapter — Unbounded Growth — Low

**Finding:** `MemoryStorageAdapter._data` is a `Map` with no eviction policy. Used in tests, so this is acceptable — but if ever used in production, memory grows unboundedly.

### 5.2 NetlifyBlobAdapter — Lazy Store Initialization — Low

**Finding:** `_getStore()` lazily creates the store on first access. This is correct behavior but means the first request after a cold start pays the initialization cost.

---

## 6. Language Features for Performance

### 6.1 Available in ES2025 (current target)

| Feature | Benefit | Applicability |
|---------|---------|:-------------:|
| **Web Workers** (`new Worker()`) | Offload CPU-intensive work from main thread | PoW computation, canvas hashing |
| **SharedArrayBuffer** (with COOP/COEP headers) | Zero-copy data sharing between threads | High-frequency signal collection |
| **Compression Streams API** (`CompressionStream`) | Client-side gzip before upload | Reduce submission payload size |
| **Cache API** (`caches.open()`) | Cache third-party responses locally | ipinfo.io, ipify.org responses |
| **`requestIdleCallback()`** | Defer non-critical work to idle periods | Canvas hash, font enumeration |
| **`structuredClone()`** | Faster deep cloning than JSON.parse/stringify | Object copying in storage layer |
| **Optional chaining (`?.`)** | Already used throughout | Prevents TypeError on missing properties |
| **Nullish coalescing (`??`)** | Already used throughout | Clean default values |

### 6.2 Node.js Features

| Feature | Benefit | Applicability |
|---------|---------|:-------------:|
| **`fs.promises`** | Non-blocking file I/O (async, not sync) | Docker endpoint storage |
| **`stream/promises`** | Pipeline with backpressure | Large archive operations |
| **`perf_hooks`** (`performance.now()`) | Already used in SPA; add to server | Server-side timing metrics |
| **`node:crypto`** `scrypt`/`pbkdf2` | Async password hashing | Not currently used (SHA-256 sync) |

---

## 7. Formal Tools & Methods for Performance Checking

### 7.1 Static Analysis

| Tool | What It Checks | Status |
|------|---------------|:------:|
| **ESLint** (custom rules) | Code quality, anti-patterns | ✅ 9 rules active |
| **`no-unused-vars`** (ESLint built-in) | Dead code elimination | ✅ Active |
| **`no-undef`** | Runtime ReferenceError prevention | ✅ Active |
| **TypeScript `checkJs`** | Type correctness, prevents silent coercions | ✅ Active on `lib/` |
| **ESLint `performance-plugin`** | Performance anti-pattern detection | ⬜ NOT installed |

**Recommendation:** Add `eslint-plugin-optimize-regex` and a custom rule for `no-full-blob-read-write` patterns.

### 7.2 Runtime Profiling

| Tool | What It Checks | Cost | Applicability |
|------|---------------|:----:|:-------------:|
| **Node.js `--prof` / `--cpu-prof`** | CPU hotspots in serverless functions | Free | Docker endpoint |
| **Chrome DevTools Performance** | Main thread blocking in SPA | Free | Manual testing |
| **`perf_hooks` PerformanceObserver** | Programmatic server-side timing | Free | Both endpoints |
| **Netlify function logs** | Execution duration per invocation | Included | Serverless |
| **Chrome Tracing (about:tracing)** | Full browser performance trace | Free | Automation tests |

### 7.3 Benchmarking

| Tool | What It Checks | Status |
|------|---------------|:------:|
| **Playwright `--repeat-each`** | Consistent timing across runs | ✅ Available |
| **`benchmarks.json`** | Browser config timing data | ✅ Exists |
| **Lighthouse CI** | FCP, LCP, TTI, TBT, CLS | ⬜ NOT set up |
| **WebPageTest** | Multi-location performance | ⬜ NOT integrated |

### 7.4 Formal Methods

TLA+ is poorly suited for performance properties (it models logical correctness, not timing). For performance, use:

| Method | What It Checks | Applicability |
|--------|---------------|:-------------:|
| **Performance budgets** (Lighthouse thresholds in CI) | Regressions in load metrics | SPA |
| **Invariant: submission latency < 1s** | Blob store read-modify-write regression | Serverless |
| **Invariant: main thread blocking < 100ms** | Web Worker migration verification | SPA |
| **Statistical benchmark comparison** (A/B test before/after) | Performance improvement significance | All |

---

## 8. Actionable Items

Each item includes: **recommendation**, **effort**, **impact**, **trade-offs**, and **decision**.

---

### Item A: Deduplicate SPA Code (index.html)

**What:** Extract the 3 copies of JS into a single module, served as an external file (not inline). Use `<script type="module" src="js/scrutari.mjs">` with `defer`.

**Effort:** 1-2 days (careful — must preserve all 3 deployment contexts)

**Impact:** 
- File: 544 KB → ~180 KB (**67% reduction**)
- Parse time: ~1.5s → ~500ms (baseline desktop)
- Memory: 3× fewer function objects in heap
- Maintainability: single copy to edit, no more `String.lastIndexOf` hacks

**Trade-offs:**
- Changes the deployment model (inline → external file)
- Module scripts require a bundler step or careful path handling on Netlify
- Risk of regression if the 3 copies had diverged (they shouldn't have, but verify)
- Testing: baseline tests must pass with the new loading pattern

**Alternatives:**
1. ✅ **Recommended:** External module file with build step
2. Keep inline but deduplicate into a single `<script>` block (simpler, no build step, but still inline)
3. Use a bundler (esbuild — already used by Netlify internally) to produce a single minified file

**Tracking:** GitHub issue + branch

**Decision:** [ ] Ignore  [ ] Implement  [x] **Recommend: Implement** — highest-impact performance improvement available

---

### Item B: Refactor Blob Store to Per-Key Access

**What:** Instead of one `scrutari-data` key containing the entire database, store fingerprints as individual keys (`fp:<hash>`), counts as a separate key, and distributions as another. Only read/write the parts that changed.

**Effort:** 1-2 days

**Impact:**
- Eliminates linear scan for read-modify-write
- Submission latency stays O(1) regardless of dataset size
- Enables incremental archive (archive old fingerprints without touching current data)

**Trade-offs:**
- Multiple blob keys = more Netlify Blob API calls per submission (2-3 instead of 1)
- Analysis endpoint needs to aggregate across keys (more complex query)
- Migration needed for existing blob data

**Alternatives:**
1. ✅ **Recommended:** Per-key access with a separate "index" key for enumeration
2. Keep single blob but add periodic snapshotting (stop-gap, not a real fix)
3. Move to a database (neon.tech serverless Postgres or similar) for the submission endpoint

**Decision:** [ ] Ignore  [ ] Implement  [x] **Recommend: Implement** — prevents a hard scalability ceiling

---

### Item C: Web Worker for PoW + Canvas Hashing

**What:** Move PoW computation and canvas `toDataURL()` hashing to a Web Worker. The main thread initiates, the worker computes, the result is posted back.

**Effort:** 0.5-1 day

**Impact:**
- Main thread blocking during ~500ms PoW: eliminated (0ms blocking)
- Canvas hash computation offloaded
- UI stays responsive during fingerprint collection
- More accurate PoW timing (isolated from main-thread jank)

**Trade-offs:**
- Web Workers cannot access DOM, AudioContext, or WebGL — only pure computation moves
- Worker startup cost (~5ms) amortized over PoW time
- Cross-Origin-Opener-Policy / Cross-Origin-Embedder-Policy headers needed for SharedArrayBuffer (not needed for basic workers)

**Alternatives:**
1. ✅ **Recommended:** Web Worker for pure computation only (PoW, canvas hash, BigInt bench)
2. `requestIdleCallback()` for lighter offloading (simpler, but no guaranteed scheduling)
3. Keep main-thread but add progress UI (already partially done — PoW shows percentage)

**Decision:** [ ] Ignore  [ ] Implement  [x] **Recommend: Implement** — clear win for UX with minimal risk

---

### Item D: Performance Budgets in CI

**What:** Add Lighthouse CI to CI pipeline with performance budgets:
- Total JS size < 200 KB
- FCP < 2s (mobile simulated)
- TBT < 200ms
- No main-thread blocking > 100ms for fingerprinting

**Effort:** 0.5 day

**Impact:**
- Prevents performance regressions from being merged
- Makes performance a first-class CI concern
- Provides a dashboard for tracking over time

**Trade-offs:**
- Lighthouse CI adds ~1-2 minutes to CI time
- Requires Chrome (available in GitHub Actions)
- Budgets must be calibrated to current baseline first

**Alternatives:**
1. ✅ **Recommended:** Lighthouse CI with calibrated budgets
2. Custom Playwright script measuring `performance.timing` and `performance.memory`
3. Manual performance review (scales poorly)

**Decision:** [ ] Ignore  [ ] Implement  [x] **Recommend: Implement** — cheap insurance

---

### Item E: Resource Hints for Third-Party Origins

**What:** Add `<link rel="preconnect">` for ipinfo.io, api.ipify.org, test-ipv6.com to the SPA `<head>`. Add `<link rel="dns-prefetch">` as fallback for browsers that don't support preconnect.

**Effort:** 15 minutes

**Impact:**
- Saves ~200-800ms per third-party origin on first fetch
- Applies to all 3 copies (single `<head>` addition)

**Trade-offs:**
- Preconnect opens TCP+TLS early, even if the user never triggers that fetch
- Minor overhead for auto-submit visitors who never see the page

**Alternatives:**
1. ✅ **Recommended:** Preconnect for the 3 third-party origins
2. Remove third-party dependencies entirely (discussed below in Item F)

**Decision:** [ ] Ignore  [x] **Recommend: Implement**  [ ] Defer — trivial win, no risk

---

### Item F: Reduce Third-Party Fetch Dependencies

**What:** Evaluate whether ipinfo.io and ipify.org are still needed. The system now collects IP information from server-side headers (`x-forwarded-for`, `x-nf-client-connection-ip`). Client-side IP detection duplicates server-side data.

**Effort:** 1-2 hours to audit and remove

**Impact:**
- Eliminates 2 external fetches per page load
- Reduces page load time by ~400-1600ms (2 × DNS+TCP+TLS+request time)
- Improves privacy (no data sent to third parties)

**Trade-offs:**
- ipinfo.io provides ASN and org data that may not be available server-side on all deployments
- Some research value in comparing client-reported vs server-detected IP
- Remove entirely or gate behind a config flag

**Alternatives:**
1. ✅ **Recommended:** Gate client-side IP fetches behind a feature flag, default off
2. Remove entirely (data is redundant with server-side headers)
3. Keep but cache aggressively (Cache API in Service Worker)

**Decision:** [ ] Ignore  [x] **Recommend: Implement**  [ ] Defer

---

### Item G: Async Filesystem I/O in Docker Endpoint

**What:** Replace `fs.readFileSync`/`fs.writeFileSync` with `fs.promises.readFile`/`fs.promises.writeFile` in `server.js`. The `StoreMutex` already serializes access — use it with async I/O instead of blocking I/O.

**Effort:** 1-2 hours

**Impact:**
- Under concurrent load, store operations don't block the event loop
- Other requests (rate limit checks, challenge issuance) proceed during I/O
- No change to correctness — mutex still ensures atomicity

**Trade-offs:**
- Slightly more complex error handling (try/catch around async I/O)
- `writeFileSync` + `renameSync` atomic write pattern needs adaption for async
- At current traffic levels (~1 request/minute), measurable improvement is negligible

**Alternatives:**
1. ✅ **Recommended:** Async I/O with the existing mutex
2. Keep sync I/O (simpler, adequate at current scale)
3. Use a proper database (SQLite via `better-sqlite3` for the Docker endpoint)

**Decision:** [ ] Ignore  [x] **Recommend: Implement**  [ ] Defer — low effort, principled fix

---

### Item H: Submit Function Serialization Optimization

**What:** Hoist the `JSON.stringify()` call to avoid double serialization:

```js
// Before:
const blobSize = new TextEncoder().encode(JSON.stringify(db)).length;
await store.set(BLOB_NAME, JSON.stringify(db));

// After:
const dbStr = JSON.stringify(db);
const blobSize = new TextEncoder().encode(dbStr).length;
await store.set(BLOB_NAME, dbStr);
```

**Effort:** 5 minutes

**Impact:** Eliminates one full JSON serialization per submission. At 100K fingerprints (~50 MB), this saves ~300ms per call.

**Trade-offs:** Minimal — trivially correct refactor.

**Alternatives:** Only one approach needed.

**Decision:** [ ] Ignore  [x] **Recommend: Implement**  [ ] Defer — trivial fix, do it with Item B

---

### Item I: ML Training `n_jobs` + Checkpoints

**What:** Add `n_jobs=-1` to `RandomForestClassifier()` for parallel training. Add checkpoint support (save model periodically during training).

**Effort:** 1 hour

**Impact:** Training time reduces from `O(n_estimators × samples / 1 core)` to `O(n_estimators × samples / n_cores)`.

**Trade-offs:** `n_jobs=-1` uses all available CPU cores — appropriate for a dedicated training container.

**Decision:** [ ] Ignore  [x] **Recommend: Implement**  [ ] Defer

---

### Item J: Add Server-Side Timing Metrics

**What:** Add `perf_hooks` PerformanceObserver to the Docker endpoint and log timing breakdowns:
- `store.read` — time to load and parse store
- `fp.hash` — SHA-256 computation time
- `dist.update` — distribution update time
- `store.write` — serialize + write time
- `total` — full request handling time

**Effort:** 1 hour

**Impact:**
- Enables data-driven performance decisions
- Identifies regressions before they cause timeouts
- Provides operational observability

**Trade-offs:**
- Adds ~50 bytes per log line to function logs
- PerformanceObserver is available in Node.js 20+ (our target)

**Alternatives:**
1. ✅ **Recommended:** Structured JSON log lines with timing
2. Netlify's built-in metrics (less granular)
3. OpenTelemetry (overkill for current scale)

**Decision:** [ ] Ignore  [ ] Implement  [x] **Recommend: Defer** — valuable but not blocking; create GitHub issue

---

### Item K: Lighthouse CI Performance Budgets

**What:** Add Lighthouse CI to `.github/workflows/ci.yml`. Set initial budgets:
- `maxTotalBlockingTime: 200ms`
- `maxLargestContentfulPaint: 3.0s`
- `maxTotalKiloBytes: 300` (for the SPA)

**Effort:** 0.5 day

**Impact:** Prevents performance regressions from reaching production.

**Trade-offs:**
- Lighthouse CI runs add ~2 minutes to CI pipeline
- Budgets need periodic recalibration
- Not available offline (requires Chrome)

**Alternatives:**
1. ✅ **Recommended:** Lighthouse CI
2. Custom Playwright perf tests
3. Manual testing

**Decision:** [ ] Ignore  [ ] Implement  [x] **Recommend: Defer** — create GitHub issue, implement after SPA dedup (Item A)

---

### Item L: Request Batching for Behavioral Data

**What:** Instead of sending individual behavioral events (mouse moves, scrolls, clicks) as separate payloads, batch them client-side and send on a 5-second interval or when the buffer reaches 100 events.

**Effort:** 0.5 day

**Impact:**
- Reduces number of HTTP requests for long sessions
- Lower server-side overhead (fewer function invocations)
- Lower network overhead (fewer TCP connections)

**Trade-offs:**
- Slightly delayed data arrival (bounded by 5s)
- Loss of up to 5s of data if user closes tab abruptly (mitigate with `navigator.sendBeacon()` on page unload)
- More complex client-side state management

**Alternatives:**
1. ✅ **Recommended:** Batch behavioral data with `sendBeacon()` fallback
2. Keep per-event POST (simpler, adequate at low traffic)
3. WebSocket for real-time streaming (overkill)

**Decision:** [ ] Ignore  [ ] Implement  [x] **Recommend: Defer** — valuable for production but not blocking research

---

### Item M: ESLint Performance Plugin

**What:** Add `eslint-plugin-optimize-regex` and a custom rule for detecting the double-`JSON.stringify` pattern and full-blob read-modify-write.

**Effort:** 1 hour

**Impact:** Catches new performance anti-patterns in CI before merge.

**Trade-offs:** New dev dependency. May produce false positives for intentional patterns.

**Decision:** [ ] Ignore  [ ] Implement  [x] **Recommend: Defer** — create GitHub issue, implement alongside other ESLint improvements

---

## 9. Grouped Implementation Strategy

```
Immediate (P0) — implement this session:
  A. SPA code deduplication     ← highest impact: 67% size reduction
  B. Per-key blob access         ← prevents hard scalability ceiling
  C. Web Worker for PoW          ← clear UX win
  E. Resource hints              ← 15 min, trivial win
  H. JSON.stringify hoist         ← do with Item B

Short-term (P1) — next session:
  D. Performance budgets in CI   ← cheap regression insurance
  F. Reduce third-party fetches  ← privacy + perf win
  G. Async filesystem I/O        ← principled fix
  I. ML n_jobs + checkpoints     ← parallel training

Medium-term (P2) — GitHub issues:
  J. Server-side timing metrics  ← observability enabler
  K. Lighthouse CI                ← after SPA dedup
  L. Behavioral data batching    ← production scaling
  M. ESLint performance plugin   ← tooling improvement
```

---

## 10. Summary

| Item | Area | Effort | Impact | Recommendation |
|:----:|:----:|:------:|:------:|:--------------:|
| **A** | SPA dedup | 1-2d | 🔴 Critical 67% size reduction | **Implement** |
| **B** | Blob per-key | 1-2d | 🔴 Prevents O(n) scaling ceiling | **Implement** |
| **C** | Web Worker PoW | 0.5-1d | 🟡 Eliminates main-thread blocking | **Implement** |
| **D** | CI perf budgets | 0.5d | 🟡 Prevents regressions | **Implement** |
| **E** | Resource hints | 15m | 🟡 Saves 200-800ms per origin | **Implement** |
| **F** | Reduce 3rd-party fetches | 1-2h | 🟡 Removes 2 external calls | **Implement** |
| **G** | Async FS I/O | 1-2h | 🟢 Principled, low traffic impact | **Implement** |
| **H** | JSON.stringify hoist | 5m | 🟢 Trivial fix | **Implement** (with B) |
| **I** | ML n_jobs + checkpoints | 1h | 🟢 Parallel training | **Implement** |
| **J** | Server timing metrics | 1h | 🟢 Observability enabler | **Defer** (issue) |
| **K** | Lighthouse CI | 0.5d | 🟢 Regression prevention | **Defer** (after A) |
| **L** | Behavioral batching | 0.5d | 🟢 Reduces request count | **Defer** (issue) |
| **M** | ESLint perf plugin | 1h | 🟢 Catches anti-patterns | **Defer** (issue) |
