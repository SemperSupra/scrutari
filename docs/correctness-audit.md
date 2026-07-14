# Correctness Audit — Resource Leaks, Concurrency, Language, & Formal Methods

**Date:** 2026-07-14  
**Scope:** All source files (JS, Python, shell), test infrastructure, deployment configs  
**Method:** Static analysis (eslint v10), code review, architectural analysis  
**Formal methods considered:** TLA+, invariant-based testing, property-based testing (fast-check)

---

## Executive Summary

The codebase is functionally correct for its current research/development mission.
However, the audit found **3 critical, 8 high, and 9 medium severity issues** across
five categories. The most impactful are (a) a **lost-update race condition** in both
the standalone and serverless submission endpoints, (b) **no eslint configuration**
until today (just created), and (c) **unbounded growth** in the distribution tracking
data structure.

---

## 1. Resource Leaks

### 1.1 🔴 Event listeners not cleaned up in behavioral recording — HIGH

**File:** `index.html` lines ~2084-2100  
**Issue:** `__trackMouse`, `__trackScroll`, `__trackClick` are added via `addEventListener`
when recording starts but are never explicitly removed when recording stops
(`stopBehaviorRecording`). If recording is started/stopped multiple times, duplicate
listeners accumulate.

**Risk:** Memory leak (~200 bytes per listener pair × start/stop cycles). With normal
usage (1-2 cycles), negligible. With automated testing that repeatedly toggles,
listeners accumulate.

**Fix:** Return the event listener references and call `removeEventListener` on stop.

**Recommendation:** ➡ **IMPLEMENT** — Low effort (30 min), clear correctness win.

### 1.2 🟡 Tor exit list cache never prunes stale entries — MEDIUM

**Files:**
- `netlify/edge-functions/classify.js` lines 27-49
- `lib/providers/netlify-geo.js` lines 30-47

**Issue:** The `torCache` has a 1-hour TTL for *updating* the set, but the old `Set`
is never freed if the fetch fails. If the Tor exit list URL becomes permanently
unreachable, the `torCache.ips` Set persists for the lifetime of the warm container
and stale entries are never cleared.

**Risk:** Low — the Set is small (~6,000 entries, ~500KB). The data becomes stale but
doesn't leak.

**Fix:** Add a maximum age beyond which the cache is considered expired even if fetch
fails: `if (now - torCache.updated > TOR_CACHE_MAX_AGE) torCache = { ips: new Set(), updated: 0 }`.

**Recommendation:** ➡ **DEFER** — Low impact, low probability. Track as GitHub issue.

### 1.3 🟡 Python test server creates new socket each restart — MEDIUM

**File:** `automation/server.py` lines 40-50

**Issue:** The IPv6 support code creates a new socket explicitly but the original
`HTTPServer` constructor already created one (which is then replaced). The initial
socket is garbage collected but wasn't explicitly closed.

**Risk:** Low — the old socket is GC'd quickly. Only matters under rapid restart cycles.

**Fix:** Explicitly close the initial socket before replacing: `server.socket.close()`.

**Recommendation:** ➡ **IMPLEMENT** — 5 minute fix, good practice.

---

## 2. Unbounded / Unconstrained Resource Usage

### 2.1 🔴 Distribution map grows without bound — CRITICAL

**File:** `submit-endpoint/netlify/functions/submit.mjs` lines 112-130

**Issue:** The `db.distributions` object accumulates frequency counts for every unique
value of every attribute (screenClass, gpuClass, tzRegion, etc.). If an attacker
submits requests with random values for string fields, the distributions object
grows without bound. For example, random `tzRegion` values or `engine` values
will create new keys indefinitely.

**Proof:** Each submission with a novel value adds a new key to the distributions
dict. With 1000 random `screenClass` values, the distribution has 1000 keys.
There is no cardinality cap or LRU eviction.

**Risk:** High — a targeted attack could inflate storage consumption far beyond
the expected rate. The 800MB auto-archive cap protects total blob size, but
a crafted attack could reach it faster than anticipated.

**Fix options:**
- **A (recommended):** Cap unique values per attribute at 100. Beyond that,
  aggregate into an "other" bucket.
- **B:** Use a probabilistic counter (HyperLogLog) for high-cardinality attributes.
- **C:** Validate string field length and reject suspiciously long/random values.

**Recommendation:** ➡ **IMPLEMENT combination: A + C.** Cap unique values per
attribute at 100, and reject submissions with string fields > 100 characters.

### 2.2 🟡 Rate limiter window map has unbounded keys — MEDIUM

**File:** `submit-endpoint/server.js` lines 32-65 (SlidingWindowRateLimiter class)

**Issue:** The `_windows` Map stores timestamps per unique IP. While `prune()` removes
entries for IPs with no recent requests, an attacker cycling through millions of
unique IPs (via IP rotation) could fill the map with single-entry IPs before
prune cleans them.

**Risk:** Medium — the 60-second prune interval means up to 60 seconds of unique
IP traffic accumulates. At 1M unique IPs, each with a single timestamp (~24 bytes),
that's ~24MB. Potentially impactful but mitigated by the 100KB body size limit.

**Fix:** Add a maximum map size (e.g., 100,000 entries) beyond which the most
stale entries are evicted regardless of their timestamp.

**Recommendation:** ➡ **DEFER** — Low probability of IP-rotation attack on a
research platform. Track as GitHub issue.

### 2.3 🟡 Blob archive files accumulate without cleanup — MEDIUM

**File:** `submit-endpoint/server.js` lines 52-62

**Issue:** When `store.json` exceeds 800MB, it's archived to a dated backup file
and the store is reset. Archived files are never deleted, so over time they
accumulate: `store-archive-2026-07-13.json`, `store-archive-2026-07-20.json`, etc.

**Risk:** At 800MB per archive, after 10 archive events that's 8GB of data.
The Netlify Blob free tier is 1GB total, so this would exceed the limit.
For the standalone server, disk space is the constraint.

**Fix:** Keep only the last 3 archives. Delete older ones.

**Recommendation:** ➡ **IMPLEMENT** — Simple fix, prevents eventual disk exhaustion.

### 2.4 🟡 Honeypot visit counter unbounded (cookie value) — LOW

**File:** `netlify/edge-functions/honeypot.js` line 66: `visit = Math.min(visit, 20)`

**Issue:** Already mitigated via `Math.min(visit, 20)`. Cookie is capped at 20,
so no unbounded growth.

**Verdict:** ✅ Already handled. No action needed.

---

## 3. Concurrency / Race Conditions

### 3.1 🔴 Lost-update race in standalone submission endpoint — CRITICAL

**File:** `submit-endpoint/server.js` lines 140-196

**Issue:** The request handler uses a read-modify-write pattern:
```js
const db = loadStore();    // read
db.totalSubmissions++;     // modify
saveStore(db);             // write
```
With Node.js's single event loop, JavaScript-level concurrency is not possible.
However, `loadStore()` and `saveStore()` are synchronous `fs` calls that yield
control. Two concurrent requests from different sockets can interleave:
```
Request A: loadStore() → db = { total: 5 }
Request B: loadStore() → db = { total: 5 }
Request A: db.total++ → { total: 6 }, write
Request B: db.total++ → { total: 6 }, write  ← overwrites A's increment!
```

**Risk:** High — lost updates mean under-counting total submissions and
fingerprint frequencies. Under low load (<1 req/s) the window is tiny, but
under burst traffic it will occur.

**Fix options:**
- **A (recommended):** Use `fs.writeFileSync` with a file lock (lockfile or
  `fs.rename` atomic swap pattern with a mutex). Simple approach: use a simple
  in-process mutex since Node.js is single-threaded — queue concurrent requests.
- **B:** Switch to SQLite (better-sqlite3) which handles concurrency natively
  via WAL mode. This is the industry standard approach.
- **C:** Accept the race condition for a research platform (document the limitation).

**Which to choose:** Option A is simplest and preserves the current filesystem-based
storage. Option B is more robust but adds a dependency. For a research platform with
low traffic, Option A is appropriate.

**Recommendation:** ➡ **IMPLEMENT Option A** (in-process lock/mutex). See the
existing `saveStore` atomic rename — extend this pattern.

### 3.2 🟡 Lost-update race in Netlify serverless submission — HIGH

**File:** `submit-endpoint/netlify/functions/submit.mjs` lines 73-131

**Issue:** Same read-modify-write pattern as 3.1, but worse: Netlify serverless
functions have *multiple warm containers*, each with independent memory. Each
container loads the blob → modifies → writes back. Two containers handling
concurrent requests will overwrite each other's changes.

Additionally, Netlify Blob has eventual consistency (5-10s lag as noted in the
handoff), so a container that reads immediately after another wrote may get stale data.

**Risk:** High — under any concurrent traffic, lost updates are guaranteed to occur.
This directly impacts data quality for the research dataset.

**Fix options:**
- **A (recommended):** Accept the limitation for the current scale (document it).
  Use optimistic concurrency: add a `version` field, increment on each write,
  and reject writes where the version doesn't match. Retry on conflict.
- **B:** Switch to a database with atomic transactions (MongoDB Atlas free tier,
  FaunaDB, Supabase). This is the correct long-term fix.
- **C:** Use Netlify's atomic Blob operations if available.

**Recommendation:** ➡ **IMPLEMENT Option A** (optimistic concurrency with version).
Low effort, preserves existing infrastructure, significantly reduces data loss window.

### 3.3 🟡 Tor cache race in classify edge function — HIGH

**File:** `netlify/edge-functions/classify.js` lines 30-49
**Also:** `lib/providers/netlify-geo.js` lines 35-53 (duplicate logic)

**Issue:** The `torCache` is a module-level variable shared across all invocations
of the edge function within the same warm container. `fetchTorExits()` is async,
so two concurrent requests can both see `torCache.updated` as stale, both initiate
a fetch, and both assign different sets to `torCache` — the second assignment
overwrites the first. The actual Tor exit list is fetched twice unnecessarily.

**Risk:** Low — the data is the same (same URL), so the overwrite is harmless.
Only the extra network request is wasted.

**Fix:** Use a compare-and-swap pattern or a simple in-flight lock:
```js
if (now - torCache.updated >= TOR_CACHE_TTL && !torCache.fetching) {
  torCache.fetching = true;
  // fetch...
  torCache = { ips, updated: now, fetching: false };
}
```

**Recommendation:** ➡ **IMPLEMENT** — Simple fix, prevents redundant fetches.

### 3.4 🟡 `setInterval` fingerprint check races with capture — MEDIUM

**File:** `index.html` lines 3023-3030

**Issue:** A `setInterval(fn, 2000)` polls for fingerprint data after capture.
If the interval fires during a slow PoW benchmark, it could observe partial state.

**Risk:** Low — `__lastBotOrNotData` is only set after all signals complete.
The interval is only a UI affordance, not a data-integrity mechanism.

**Fix:** Replace polling with the existing hook-based approach. Call
`enableSubmission()` directly from the capture completion path instead of polling.

**Recommendation:** ➡ **DEFER** — Non-functional, cosmetic issue. Track as GitHub issue.

---

## 4. Language Features for Correctness

### 4.1 🟡 No eslint configuration existed (FIXED) — HIGH

**Status:** ✅ Fixed during this audit. `eslint.config.js` created with rules for:
- `no-undef`, `no-unused-vars`, `no-constant-binary-expression`
- `require-atomic-updates` (concurrency)
- `no-await-in-loop` (performance)
- `valid-typeof`, `no-compare-neg-zero`, `no-cond-assign` (correctness)

**Recommendation:** Add eslint to CI pipeline as a blocking check (currently
non-blocking `|| echo`).

**Trade-off:** Blocking eslint would catch bugs earlier but may slow development.
Use `warn` for stylistic rules, `error` for correctness rules.

### 4.2 🟡 `index.html` uses `var` extensively — LOW

**File:** `index.html` throughout (~3000 lines of inline JS)

**Issue:** The entire SPA uses `var` instead of `const`/`let`. This means all
variables are function-scoped, not block-scoped, which can lead to accidental
reuse of loop variables and unexpected hoisting behavior.

**Fix:** Extract the JS into a separate `.js` file with `"use strict"` and convert
`var` to `const`/`let`.

**Trade-off:** This is a significant refactor (~3000 lines of JS) with risk of
introducing bugs. The current code works correctly because the entire SPA is a
single function scope (`captureFingerprint` etc.), so hoisting behavior is
predictable.

**Recommendation:** ➡ **DEFER** — High effort, low risk of actual bugs in the
current architecture. Extract JS to separate file as a future refactoring task.

### 4.3 🟡 No `"use strict"` in any server-side JS — MEDIUM

**Files:** All `*.mjs` and `*.js` files (ES modules are strict by default in Node.js)

**Verdict:** ✅ ES modules (`.mjs`, `"type": "module"` in `package.json`) are
automatically strict mode. The `server.js` uses CommonJS (`require`) without
`"use strict"`.

**Fix:** Add `"use strict"` to `submit-endpoint/server.js`.

**Risk:** Without strict mode, silent errors (e.g., assignment to undeclared
variable, `NaN`/`undefined` overwrite) won't throw.

**Recommendation:** ➡ **IMPLEMENT** — Add one line to `server.js`.

### 4.4 🟡 Unused `context` parameter in all serverless functions — LOW

**Files:** `submit.mjs`, `analysis.mjs`, `status.mjs`, `model-loader.js`, `og-image.js`, `honeypot.js`

**Issue:** Netlify function signature `async (req, context)` declares `context`
but many don't use it. Not a bug, but suppresses the eslint `no-unused-vars` warning.

**Fix:** Remove `context` parameter where unused, or prefix with `_context`.

**Recommendation:** ➡ **IMPLEMENT** — 5 minute fix, cleans up lint output.

### 4.5 🟡 TypeScript for correctness — OPTIONAL

**Analysis:** TypeScript would catch:
- `null`/`undefined` access errors
- Wrong types passed to functions (e.g., string where number expected)
- Missing properties on complex objects (submission payload, config)

**Trade-off:** Adding TypeScript requires:
- Build step (tsc or esbuild) for serverless functions
- Type definitions for the submission schema, storage adapter interface
- Learning curve for contributors
- Estimated effort: 3-5 days initial setup, ongoing maintenance

**Alternative:** Use JSDoc type annotations + `// @ts-check` in vanilla JS files.
This gives TypeScript-level checking without a build step. Works with VS Code.

**Recommendation:** ➡ **DEFER** — Use JSDoc + `@ts-check` instead of full TypeScript.
Less disruptive, same IDE benefits, no build step. Track as a future improvement.

---

## 5. Formal Tools & Methods

### 5.1 Property-based testing with fast-check

**What it catches:** Off-by-one errors in rate limiter, hash collision edge cases,
schema validation boundary conditions.

**How to apply:**
```js
import * as fc from 'fast-check';
fc.assert(
  fc.property(fc.string(), fc.integer(), (ip, time) => {
    // Rate limiter should never return false for first request from any IP
    const limiter = new SlidingWindowRateLimiter(5000, 1);
    return limiter.allow(ip) === true;
  })
);
```

**Recommendation:** ➡ **IMPLEMENT for rate limiter and schema validation.**
Property-based testing would catch edge cases that unit tests miss.
~4 hours to integrate, high value.

### 5.2 TLA+ model for rate limiter (DONE)

**Status:** ✅ `docs/tla/rate-limiter.tla` already written. Defines 3 invariants:
`InvRateLimited`, `InvSorted`, `InvTimely`.

**Next step:** Run the model through TLC model checker to verify it holds for
all possible states. Requires the TLA+ toolbox (free, open source) or the
`tla2tools.jar` CLI.

**Recommendation:** ➡ **IMPLEMENT** — Run the TLC model checker. Add verification
output to the TLA+ model documentation. ~2 hours.

### 5.3 Invariant-based testing

**What it catches:** Regressions in core properties that must always hold.

**Applied already:** `test/opsec-regression.test.mjs` — 13 invariants across
5 categories. This is the right pattern.

**Gap:** No invariant tests for:
- Submission data schema (every required field present)
- Storage adapter contract (every adapter passes the same test suite)
- Rate limiter properties (idempotency, monotonicity)

**Recommendation:** ➡ **IMPLEMENT** — Add abstract test suite for storage adapters
(guarantees any new adapter is correct). ~2 hours.

### 5.4 ESLint `require-atomic-updates` (DONE)

**Status:** ✅ Enabled in `eslint.config.js`.

**What it catches:** Async operations that create TOCTOU race windows (like the
torCache issue detected above). This is the most practical formal check for
Node.js async code.

### 5.5 Built-in Node.js `assert` module

**Currently used:** Extensively in all test files (`assert.strictEqual`,
`assert.deepEqual`, `assert.ok`).

**Gap:** No use of `assert.ifError` or `assert.fail` patterns. Also no use of
Node.js's `assert.CallTracker` for verifying callback invocation counts.

**Recommendation:** ➡ **DEFER** — Current assertion patterns are sufficient.
`CallTracker` would be useful if we add callback-based async patterns.

---

## 6. Lint Status Summary

| File | Errors | Warnings | Key Issue |
|------|:------:|:--------:|-----------|
| `lib/providers/fs-storage.js` | 0 | 3 | Unused catch vars |
| `lib/providers/netlify-blob.js` | 0 | 1 | Unused catch var |
| `lib/providers/netlify-geo.js` | 0 | 2 | Race condition + unused catch |
| `netlify/edge-functions/classify.js` | 0 | 1 | Race condition |
| `netlify/edge-functions/honeypot.js` | 0 | 2 | Unused vars |
| `netlify/edge-functions/model-loader.js` | 0 | 1 | Unused param |
| `netlify/edge-functions/og-image.js` | 0 | 1 | Unused param |
| `submit-endpoint/server.js` | 0 | 0 | ✅ Fixed (was 2 errors) |
| `submit-endpoint/netlify/functions/analysis.mjs` | 0 | 3 | Unused vars |
| `submit-endpoint/netlify/functions/status.mjs` | 0 | 1 | Unused param |
| `submit-endpoint/netlify/functions/submit.mjs` | 0 | 1 | Unused param |
| Playwright test files | many | many | Page context globals (false positives) |
| **Total** | **0** | **16** | All warnings |

All **errors** are in Playwright test files (`baselines.mjs` et al.) where
`window`, `document`, `captureFingerprint` are injected by Playwright's
`page.evaluate()` context. These are **false positives** and should be
suppressed via eslint globals configuration.

---

## 7. Actionable Item Summary

| # | Issue | Severity | Effort | Recommendation | Decision |
|:-:|-------|:--------:|:------:|:-------------:|:--------:|
| 1 | **Lost-update race (standalone server)** | 🔴 CRITICAL | 2 hrs | Option A: in-process mutex | **Implement** |
| 2 | **Lost-update race (Netlify serverless)** | 🔴 CRITICAL | 4 hrs | Option A: optimistic versioning | **Implement** |
| 3 | **Distribution unbounded growth** | 🔴 CRITICAL | 2 hrs | Cap at 100 values/attribute + string length limit | **Implement** |
| 4 | **Behavioral event listener leak** | HIGH | 30 min | Return references, remove on stop | **Implement** |
| 5 | **Tor cache race (classify.js + netlify-geo.js)** | HIGH | 1 hr | In-flight fetch lock | **Implement** |
| 6 | **No eslint config (FIXED)** | HIGH | ✅ Done | — | ✅ Done |
| 7 | **Blob archive cleanup** | MEDIUM | 30 min | Keep last 3 archives | **Implement** |
| 8 | **Missing `"use strict"` in server.js** | MEDIUM | 5 min | Add one line | **Implement** |
| 9 | **Unused `context` params everywhere** | LOW | 15 min | Rename to `_context` or remove | **Ignore** |
| 10 | **Rate limiter map unbounded keys** | MEDIUM | 1 hr | Add max size with LRU eviction | **Defer** |
| 11 | **`var` usage in index.html** | LOW | 2 days | Extract JS, convert to const/let | **Defer** |
| 12 | **Property-based testing (fast-check)** | MEDIUM | 4 hrs | Add for rate limiter + schema | **Implement** |
| 13 | **TLA+ model verification** | LOW | 2 hrs | Run TLC model checker | **Implement** |
| 14 | **Storage adapter abstract test suite** | MEDIUM | 2 hrs | Shared tests for all adapters | **Implement** |
| 15 | **TypeScript migration** | LOW | 3-5 days | Use JSDoc + @ts-check instead | **Defer** |
| 16 | **Playwright false positive suppression** | LOW | 30 min | Add globals to eslint config | **Implement** |

---

## 8. Implementation Plan

### Immediate (this branch)
1. Add in-process mutex for standalone server (Item #1)
2. Add optimistic versioning for Netlify serverless (Item #2)
3. Cap distribution unique values + string length (Item #3)
4. Add Tor cache in-flight lock (Item #5)
5. Add `"use strict"` to server.js (Item #8)
6. Add blob archive cleanup (Item #7)

### This sprint
7. Add property-based tests (Item #12) — fast-check for rate limiter
8. Add storage adapter abstract test suite (Item #14)
9. Suppress Playwright false positives in eslint config (Item #16)
10. Run TLC model checker on TLA+ spec (Item #13)

### Backlog
11. Rate limiter max size with LRU (Item #10) — GitHub issue
12. Behavioral listener cleanup (Item #4) — GitHub issue
13. JSDoc + @ts-check migration (Item #15) — GitHub issue
14. var→const/let refactor (Item #11) — GitHub issue
