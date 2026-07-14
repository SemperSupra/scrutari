# Resource Allocation Audit — Bounds, Limits & Configurability

**Date:** 2026-07-14
**Scope:** All JS, Python, shell, and config files
**Method:** Static analysis of every allocation site, array push, timer, and numeric constant

---

## Executive Summary

The codebase has **3 unbounded allocations**, **12 arbitrarily-capped allocations** that should be configurable, and **7 undocumented constants**. The most critical issues are: (a) behavioral event arrays grow without limit during recording, (b) the PoW benchmark has a hardcoded 50K-iteration cap that's neither configurable nor documented, and (c) multiple timeout values are hardcoded with no rationale.

---

## 1. Unbounded Allocations (no limit — HIGH risk)

### 1.1 🔴 Behavioral event arrays — UNBOUNDED

**File:** `index.html` lines 2085-2151
**Pattern:** Every user interaction pushes to an array:
```js
__behavior.events.mouse.push({ x, y, t });
__behavior.events.scroll.push({ y, t });
__behavior.events.click.push({ x, y, t, target, id, text });
__behavior.events.key.push({ key, t, type });
__behavior.events.touch.push({ x, y, t, type });
// ... 14 event types total
```

**Risk:** During the 15-second recording window, a user could generate ~10,000+ events
(rapid mouse movement at 60Hz = 900 events/sec × 15s = 13,500 mouse events alone).
Each event object is ~64 bytes. 14 arrays × 13,500 events × 64 bytes ≈ 12MB of
event data accumulated in the browser tab during a single recording session.

**This is the single largest unbounded allocation in the system.**

**Fix:**
- Cap each event array at a reasonable maximum (e.g., 5000 for mouse, 500 for scroll,
  200 for click, 1000 for key, etc.)
- Sample high-frequency events (mouse at 20Hz instead of 60Hz — every 50ms, not every frame)
- Or truncate oldest events when the cap is reached: `if (arr.length > MAX) arr.shift()`

**Recommendation:** ➡ **IMPLEMENT** — Add per-array caps. ~1 hour.

### 1.2 🟡 `__behavior.events` object accumulates properties — MEDIUM

**File:** `index.html` line 2211
```js
__behavior = { 
  running: true, timer: null, timeout: null, duration: 15000, startTime: performance.now(),
  events: { mouse: [], scroll: [], click: [], key: [], focus: [], resize: [], touch: [], 
            input: [], formClicks: [], inputFocus: [] }, count: 0 
};
```

**Note:** Some event properties (pageNav, motion, orientation, zoom, visibility, paste)
are added dynamically during `startBehaviorRecording()` via push to arrays that don't
exist in the initial object. They're initialized on first push via the event handler.

**Risk:** LOW — the object is reset on each `startBehaviorRecording()` call.
The arrays added dynamically are the same ones that would be in the initializer.

**Fix:** Include all event arrays in the initializer, even if empty.
This makes the object shape predictable and avoids hidden property creation.

**Recommendation:** ➡ **IMPLEMENT** — Add missing arrays to initializer. 5 minutes.

### 1.3 🟡 Blob distribution map — CAPPED (just fixed)

**File:** `submit-endpoint/netlify/functions/submit.mjs` line 176-181
**Status:** ✅ **FIXED** in the correctness audit (added `MAX_DIST_VALUES = 100`).

**Before:** Unbounded — any unique attribute value created a new distribution key.
**After:** Capped at 100 unique values per attribute; excess goes to `__other` bucket.

---

## 2. Arbitrarily Capped Allocations (configurable limits)

### 2.1 🟡 PoW benchmark maxAttempts = 50,000 — ARBITRARY

**File:** `index.html` line 1037
```js
var maxAttempts = 50000;
```

**Problem:** This value was chosen without justification. On a fast machine (M-series
Mac, Ryzen 9), 50K SHA-256 hashes completes in ~5ms. On a slow machine (old mobile),
it might take 200ms. The ratio is 40×.

**Documentation needed:**
- Why 50,000? (empirical: finds 16 leading zero bits with high probability)
- Should vary by device capability? (adaptive difficulty)
- Should be server-configurable? (for PoW challenge-response, PR 1.4)

**Fix:** Move to a named constant with documentation, or make it configurable:
```js
const POW_MAX_ATTEMPTS = 50000; // 16-bit PoW target, ~50K attempts for 50% success
```

**Recommendation:** ➡ **IMPLEMENT** — Document as named constant with rationale.

### 2.2 🟡 Behavioral recording duration = 15,000ms — ARBITRARY

**File:** `index.html` line 2261
```js
__behavior.timeout = setTimeout(stopBehaviorRecording, __behavior.duration);
```
where `__behavior.duration = 15000`.

**Problem:** 15 seconds was chosen as "long enough to collect data but short enough
to not annoy users." No data supports this choice. Longer recordings capture more
behavioral signal but risk user abandonment.

**Fix:** Make configurable with a query parameter override:
```js
const BEHAVIOR_DURATION = parseInt(params.get('duration')) || 15000;
```

**Recommendation:** ➡ **IMPLEMENT** — Add URL parameter override.

### 2.3 🟡 Font enumeration list = 26 fonts — ARBITRARY

**File:** `index.html` lines 804-808
```js
var fonts = ['Arial', 'Helvetica', 'Times New Roman', ...]; // 26 fonts
```

**Problem:** These 26 fonts were chosen as "common." The list determines the
fontCount signal (w4), which is one of the strongest fingerprinting signals.
Adding or removing fonts changes the fingerprint for all users.

**Documentation needed:** Source of the font list (EFF Panopticlick? BrowserLeaks?
Empirical testing?)

**Recommendation:** ➡ **IMPLEMENT** — Document the source in a comment.
Trade-off: The font list should be stable (not configurable) for fingerprint
consistency, but its provenance should be documented.

### 2.4 🟡 WebRTC STUN timeout = 3000ms — ARBITRARY

**File:** `index.html` lines 1984-2000
```js
setTimeout(r, 3000); // 3s per STUN technique
setTimeout(r, 2000); // 2s for ice trickle
```

**Problem:** Four STUN techniques, each with 2-3s timeout. Total worst-case WebRTC
test time: ~12 seconds. On high-latency networks (satellite: 600ms+ RTT), 3s may
not be enough for STUN to complete. On low-latency networks, 3s is excessive.

**Fix:** Make configurable:
```js
const STUN_TIMEOUT = parseInt(params.get('stunTimeout')) || 3000;
```

**Recommendation:** ➡ **IMPLEMENT** — Add URL parameter override.

### 2.5 🟡 IPv6 probe timeout = 3000ms — ARBITRARY

**File:** `index.html` line 2055
```js
var timeoutId = setTimeout(function() { controller.abort(); }, 3000);
```

**Same analysis as 2.4.** Single-endpoint probe with 3s timeout.

**Recommendation:** ➡ **IMPLEMENT** — Part of the IPv6 probe experiment (Phase 5.1).

### 2.6 🟡 Max archive files = 3 — REASONABLE

**File:** `submit-endpoint/server.js` line 31
```js
const MAX_ARCHIVES = 3;
```

**Verdict:** ✅ Reasonable. Archiving at 800MB means 3 archives = 2.4GB of data,
which is manageable. Could be configurable via environment variable.

**Recommendation:** ➡ **DEFER** — Document as `// Keep only this many archive files`.
Track as GitHub issue for env-var configurability.

### 2.7 🟡 Rate limiter window = 5000ms, max = 1 — REASONABLE

**File:** `submit-endpoint/server.js` line 8
```js
const RATE_LIMIT_MS = process.env.RATE_LIMIT_MS ? parseInt(process.env.RATE_LIMIT_MS, 10) : 5000;
```

**Verdict:** ✅ Already configurable via environment variable. Good.

### 2.8 🟡 Max body size = 100KB — REASONABLE

**File:** `submit-endpoint/server.js` line 10
```js
const MAX_BODY_BYTES = parseInt(process.env.MAX_BODY_BYTES, 10) || 102400;
```

**Verdict:** ✅ Already configurable via environment variable. Good.

### 2.9 🟡 Max blob size before archive = 800MB — REASONABLE

**File:** `submit-endpoint/server.js` line 30
```js
const MAX_DB_SIZE = 800 * 1024 * 1024; // 800MB
```

**Issue:** NOT configurable via environment variable. Should be.
Netlify Blob free tier is 1GB, so 800MB is 80% of quota — a good threshold.
But in a self-hosted Docker deployment, disk space may warrant a different value.

**Fix:** `const MAX_DB_SIZE = (parseInt(process.env.MAX_DB_SIZE_MB, 10) || 800) * 1024 * 1024;`

**Recommendation:** ➡ **IMPLEMENT** — Make configurable via env var.

### 2.10 🟡 Tor cache TTL = 1 hour — REASONABLE

**File:** `netlify/edge-functions/classify.js` line 28
```js
const TOR_CACHE_TTL = 3600000; // 1 hour
```

**Verdict:** ✅ No change needed. Tor exit lists change slowly. 1-hour cache
is standard practice.

### 2.11 🟡 Honeypot visit cap = 20 — REASONABLE

**File:** `netlify/edge-functions/honeypot.js` line 66
```js
return Math.min(visit, 20);
```

**Verdict:** ✅ Already capped. 20 visits is enough for the tarpit narrative.

### 2.12 🟡 Honeypot captures store cap = 1000 — REASONABLE

**File:** `submit-endpoint/netlify/edge-functions/honeypot.js` line 114
```js
if (captures.length > 1000) captures = captures.slice(-1000);
```

**Verdict:** ✅ Already capped at 1000.

### 2.13 🟡 Honeypot fingerprint distribution = 100 — JUST ADDED

**File:** `submit-endpoint/netlify/functions/submit.mjs` line 177
```js
const MAX_DIST_VALUES = 100;
```

**Status:** ✅ **FIXED** in the correctness audit.

---

## 3. Undocumented Constants

### 3.1 Fingerprint signal weights (36+ values)

**File:** `index.html` lines ~1680-1730
**Pattern:** `test(w, name, expectedBot, fn)` where `w` is 1-5.

**Problem:** The weight values (1-5) determine the bot score calculation but
are not documented. Why is `navigator.webdriver` w5 while `PoW timing` w3?
What research supports each weight?

**Fix:** Add a comments block documenting weight rationale:
```js
// Weights:
//   w5 = Strong bot signal (navigator.webdriver, automation frameworks)
//   w4 = Medium-strong (canvas, fonts, velocity profile)
//   w3 = Medium (PoW timing, PDF viewer, device memory)
//   w2 = Weak (adblock, DNS features, scroll pattern)
//   w1 = Informational (IPv6, gamepad, sensor APIs)
```

**Recommendation:** ➡ **IMPLEMENT** — Add comment block. 15 minutes.

### 3.2 Bot-or-Not score thresholds

**File:** `index.html` lines ~2709-2713
```js
if (pct<=15) { cat='Human-like Behavior'; emoji='🧑'; color='#22c55e'; }
else if (pct<=35) { cat='Mostly Human'; emoji='🙂'; color='#84cc16'; }
else if (pct<=55) { cat='Uncertain'; emoji='🤷'; color='#eab308'; }
else if (pct<=80) { cat='Bot-like Behavior'; emoji='🤖'; color='#f97316'; }
else { cat='Automated Behavior'; emoji='⚙️'; color='#ef4444'; }
```

**Problem:** Thresholds 15/35/55/80 are arbitrary. Why 55 and not 50?
Why 15 and not 10? No reference to research or methodology.

**Fix:** Document the rationale or reference the methodology doc.

**Recommendation:** ➡ **IMPLEMENT** — Add comment citing the methodology. 5 min.

### 3.3 Confusion matrix threshold = 50

**File:** `submit-endpoint/netlify/functions/analysis.mjs` line 82
```js
const threshold = 50; // Scores above 50 = predicted bot
```

**Verdict:** ✅ Reasonable default (symmetric threshold), but should be documented
as the default. Could be made configurable.

**Recommendation:** ➡ **DEFER** — Low priority. Document as named constant.

### 3.4 Expected baseline interval = 7 days

**File:** `submit-endpoint/netlify/functions/status.mjs` line 14
```js
const EXPECTED_INTERVAL_DAYS = 7;
```

**Verdict:** ✅ Reasonable weekly cadence. Documented with comment. Fine as-is.

---

## 4. Configurable vs Hardcoded — Summary Table

| Resource | Current Limit | Configurable? | Should Be? | Priority |
|----------|:------------:|:-------------:|:----------:|:--------:|
| Behavioral mouse events | UNBOUNDED | No | Cap at 5000 | 🔴 HIGH |
| Behavioral scroll events | UNBOUNDED | No | Cap at 500 | 🔴 HIGH |
| Behavioral all other events | UNBOUNDED | No | Cap at 500 | 🔴 HIGH |
| PoW maxAttempts | 50,000 | No | Named constant | 🟡 MED |
| Behavioral duration | 15,000ms | No | URL param | 🟡 MED |
| STUN timeout | 3,000ms | No | URL param | 🟡 MED |
| IPv6 probe timeout | 3,000ms | No | URL param | 🟡 MED |
| Max archive files | 3 | No | Env var | 🟢 LOW |
| Max blob size | 800MB | No | Env var | 🟡 MED |
| Rate limiter window | 5000ms | ✅ Env var | — | ✅ OK |
| Max body size | 100KB | ✅ Env var | — | ✅ OK |
| Behavioral recording duration | 15s | No | URL param | 🟡 MED |
| Font list size | 26 | No | Stable (intentional) | ✅ OK |

---

## 5. Formal Tools for Resource Verification

### 5.1 ESLint `no-constant-binary-expression` (ALREADY ENABLED)
Catches expressions that evaluate to a constant (often indicates a copy-paste
error in limits). ✅ Already in `eslint.config.js`.

### 5.2 ESLint `no-unmodified-loop-condition` (ALREADY ENABLED)
Catches loops where the exit condition can never be met (infinite loop = unbounded
CPU allocation). ✅ Already in `eslint.config.js`.

### 5.3 Memory profiling (Node.js `--heap-prof`)
For the standalone server: run with `--heap-prof` to generate a memory flamegraph
and verify that the blob store, distribution map, and rate limiter don't grow
unexpectedly.

```bash
node --heap-prof submit-endpoint/server.js
# Load test with autocannon, then analyze the .heapprofile
```

**Recommendation:** ➡ **IMPLEMENT** — Add to performance testing documentation. 1 hr.

### 5.4 Chrome DevTools Memory tab (Client-side)
For the SPA: use Chrome DevTools Memory tab to:
- Record a heap snapshot before and after behavioral recording
- Verify event arrays are freed when recording stops
- Verify no DOM node leaks from the behavioral recording dots

**Recommendation:** ➡ **IMPLEMENT** — Document in testing guide.

### 5.5 `memlab` — Heap exploration (META, open source)
Facebook's `memlab` can automatically detect memory leaks in web apps by
comparing heap snapshots. Useful for verifying the behavioral recording
event listener cleanup.

```bash
npx memlab run --scenario automation/memlab-scenario.js
```

**Install:** `npm install --save-dev memlab`
**Effort:** ~2 hours to write a scenario that clicks "Start" → waits → clicks "Stop".

**Recommendation:** ➡ **DEFER** — Track as GitHub issue. Useful but not critical.

### 5.6 `clinic.js` — Node.js performance profiling
For the standalone Docker server. Identifies memory hot spots, event loop delay,
and garbage collection pressure.

**Recommendation:** ➡ **DEFER** — Track. Useful before production deployment.

### 5.7 TLA+ model checking for bounded liveness
The existing TLA+ model (`docs/tla/rate-limiter.tla`) checks that the rate limiter
eventually allows a request (liveness). It could be extended to check that the
window map doesn't grow unbounded (boundedness).

**Recommendation:** ➡ **DEFER** — Already on the backlog.

---

## 6. Actionable Items Summary

| # | Item | Effort | Risk | Recommendation | Decision |
|:-:|------|:------:|:----:|:-------------:|:--------:|
| 1 | **Cap behavioral event arrays** (mouse=5000, scroll=500, others=500) | 1 hr | 🔴 | Add per-array caps with `arr.length >= MAX && arr.shift()` | **Implement** |
| 2 | **Complete event initializer** (add missing arrays to `__behavior`) | 5 min | 🟡 | Add pageNav, motion, orientation, zoom, visibility, paste | **Implement** |
| 3 | **Document PoW maxAttempts as named constant** | 5 min | 🟡 | `const POW_MAX_ATTEMPTS = 50000;` | **Implement** |
| 4 | **Make behavioral duration configurable via URL param** | 15 min | 🟡 | `?duration=30000` override | **Implement** |
| 5 | **Make STUN timeout configurable via URL param** | 10 min | 🟡 | `?stunTimeout=5000` override | **Implement** |
| 6 | **Document font list provenance** | 5 min | 🟢 | Source comment on 26-font list | **Implement** |
| 7 | **Make max blob size configurable via env var** | 10 min | 🟡 | `MAX_DB_SIZE_MB` | **Implement** |
| 8 | **Document signal weight rationale** | 15 min | 🟢 | Comment block for w1-w5 | **Implement** |
| 9 | **Document bot score thresholds** | 5 min | 🟢 | Reference methodology | **Implement** |
| 10 | **Max archive files → env var** | 10 min | 🟢 | `MAX_ARCHIVES` env var | **Defer** |
| 11 | **memlab integration** | 2 hrs | 🟢 | Memory leak detection | **Defer** |
| 12 | **Clinic.js profiling** | 2 hrs | 🟢 | Server memory analysis | **Defer** |
| 13 | **Confusion matrix threshold → named constant** | 5 min | 🟢 | Document as `BOT_THRESHOLD = 50` | **Defer** |
