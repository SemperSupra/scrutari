# Temporal Actions Audit — Timeouts, Retries, Heartbeats, Atomicity

**Date:** 2026-07-15
**Scope:** All JS, Python, shell scripts

---

## 1. All Temporal Actions Catalog

### 1.1 Network Timeouts (Client-Side)

| # | Action | Timeout | Configurable? | Progress? | Risk |
|:-:|--------|:-------:|:-------------:|:---------:|:----:|
| 1 | WebRTC STUN (4 techniques) | 2-3s each ✅ | `?stunTimeout=` | Partial | 🟡 MED |
| 2 | IPv6 connectivity probe | 3s | ❌ No | None | 🟡 MED |
| 3 | PoW challenge fetch | Browser default | ❌ No | "Computing..." message | 🟢 LOW |
| 4 | Submission POST | Browser default | ❌ No | Button shows "Submitting..." | 🟢 LOW |

### 1.2 Computation Timeouts (Client-Side)

| # | Action | Max Time | Configurable? | Progress? | Risk |
|:-:|--------|:--------:|:-------------:|:---------:|:----:|
| 5 | PoW benchmark (50K SHA-256) | ~50-500ms | `maxAttempts=50000` | None | 🟢 LOW |
| 6 | PoW challenge-response (200K SHA-256) | ~200-2000ms | Adaptive difficulty | "Computing PoW..." | 🟡 MED |
| 7 | Fingerprint capture (all signals) | ~5-15s | ❌ No | None — no spinner | 🔴 HIGH |
| 8 | Font enumeration (26 fonts) | ~500ms | Hardcoded 26 fonts | None | 🟢 LOW |

### 1.3 Persistent Timers

| # | Action | Interval | Configurable? | Cleanup? | Risk |
|:-:|--------|:--------:|:-------------:|:--------:|:----:|
| 9 | Rate limiter prune | 60s | ❌ No | ✅ | 🟢 LOW |
| 10 | Challenge cleanup | 60s | ❌ No | ✅ | 🟢 LOW |
| 11 | Behavioral UI update | 100ms | ❌ No | ✅ Cleared on stop | 🟢 LOW |
| 12 | Behavioral recording timeout | 15s (configurable via `?duration=`) | ✅ | ✅ | 🟢 LOW |
| 13 | Submission check polling | 2000ms | ❌ No | ❌ **NEVER CLEARED** | 🔴 **HIGH** |
| 14 | Honeypot tarpit cookie | 1 year | ❌ No | N/A | 🟢 LOW |

### 1.4 Server-Side Temporal Actions

| # | Action | Timeout | Configurable? | Rollback? | Risk |
|:-:|--------|:-------:|:-------------:|:--------:|:----:|
| 15 | Rate limiter window | 5000ms | ✅ `RATE_LIMIT_MS` | N/A | 🟢 LOW |
| 16 | Challenge TTL | 60000ms | ❌ No | N/A | 🟢 LOW |
| 17 | Blob write (Netlify) | Platform max | ❌ No | ❌ **No rollback on fail** | 🔴 **HIGH** |
| 18 | Blob archive | Synchronous | ❌ No | ❌ **No checkpoint** | 🟡 MED |
| 19 | Tor cache TTL | 3600000ms (1hr) | ❌ No | N/A | 🟢 LOW |
| 20 | Baseline freshness | 7 days | ❌ No | N/A | 🟢 LOW |

### 1.5 Long-Running Actions

| # | Action | Duration | Checkpoint? | Heartbeat? | Risk |
|:-:|--------|:--------:|:----------:|:----------:|:----:|
| 21 | ML training pipeline | 5-30 min | ❌ No | ❌ No | 🟡 MED |
| 22 | Baseline test suite | 5-15 min | ❌ No | Step-level logs | 🟢 LOW |
| 23 | SPA fingerprint capture | 5-15s | ❌ No | ❌ **No progress bar** | 🔴 **HIGH** |

---

## 2. Critical Issues

### 2.1 🔴 Submission check polling never stops — HIGH

**File:** `index.html` (last copy, line ~9372)

```js
var __submissionCheck = setInterval(function() {
  if (__lastBotOrNotData && __lastFingerprintData) {
    var sec = document.getElementById('submit-preview-section');
    if (sec && sec.style.display !== 'block') {
      enableSubmission(__lastFingerprintData, __lastBotOrNotData);
    }
  }
}, 2000);
```

**Problem:** This interval is set once and **never cleared**. It runs forever,
checking every 2 seconds for the entire lifetime of the page. If the user
never runs a fingerprint test, it still fires every 2s doing nothing.

**Fix:** Clear the interval after submission is enabled or on page unload:
```js
var __submissionCheck = setInterval(/* ... */);
// Later, when done:
clearInterval(__submissionCheck);
```

**Recommendation:** ➡ **IMPLEMENT** — 5 minute fix.

### 2.2 🔴 Fingerprint capture has no progress indicator — HIGH

**File:** `index.html` (captureFingerprint function)

**Problem:** The fingerprint capture runs ~36 async tests (canvas, WebGL,
fonts, PoW, speech, sensors, etc.) taking 5-15 seconds total. The user
sees nothing happening during this time — the button just says "Capturing..."

**Fix:** Add a progress counter:
```js
// At start: show "0/36 tests completed"
// Each test increments: "12/36 tests completed"
```

**Recommendation:** ➡ **IMPLEMENT** — 1 hour.

### 2.3 🔴 Blob write failure has no rollback — HIGH

**File:** `submit-endpoint/netlify/functions/submit.mjs`

**Problem:** If the Blob write fails after the in-memory store has been
modified, the submission counter has already been incremented in memory.
The response returns an error, but the in-memory state is now inconsistent.
On the next successful write, the in-memory counter may be stale.

**Fix:** Either:
- A: Revert in-memory changes on write failure
- B: Use a transaction-like pattern (save original state, restore on fail)
- C: Accept the inconsistency for a research platform (document)

**Recommendation:** ➡ **IMPLEMENT Option A** — 30 minutes.

---

## 3. Medium Issues

### 3.1 🟡 PoW challenge-response lacks progress feedback — MEDIUM

**File:** `index.html` (submitResults PoW section)

**Problem:** During the 200K-iteration PoW computation (taking ~200-2000ms),
the user sees "Computing proof-of-work..." but no indication of progress.
On slower devices this could take several seconds with no feedback.

**Fix:** Since the PoW loop is synchronous within each `await` (the
`crypto.subtle.digest()` calls are async and yield to the event loop),
the UI will update between iterations. Add an every-N-iterations update:
```js
if (_nonce % 10000 === 0) {
  // Update UI: "Computing... 30% complete"
}
```

**Recommendation:** ➡ **IMPLEMENT** — 30 minutes.

### 3.2 🟡 ML training has no checkpoint — MEDIUM

**File:** `automation/train_model.py`

**Problem:** The ML training pipeline runs all steps sequentially. If it
fails at step 4 (ONNX export), steps 1-3 have already completed. On retry,
everything runs from scratch. The SapiMouse dataset download is especially
expensive (~2 minutes on a slow connection).

**Fix:** Add checkpoint files:
```python
if os.path.exists(CHECKPOINT_DIR / 'features.npy'):
    X, y = load_checkpoint()
else:
    X, y = extract_features(...)
    save_checkpoint(X, y)
```

**Recommendation:** ➡ **DEFER** — ML training is manual, not automated yet.
Track as GitHub issue.

### 3.3 🟡 Blob archive is synchronous and blocking — MEDIUM

**File:** `submit-endpoint/server.js` (saveStore function)

**Problem:** When the store exceeds 800MB, the archive operation (copy → reset
→ save → prune) runs synchronously during the HTTP request. The client waits
500ms+ for the response while archiving happens.

**Fix:** Defer archiving to a background process or fire-and-forget:
```js
saveStore(db); // No await — fire and forget
// Or: queueMicrotask(() => archiveIfNeeded(db));
```

**Recommendation:** ➡ **IMPLEMENT** — 30 minutes.

---

## 4. Formal Tools for Temporal Verification

### 4.1 TLA+ for Liveness Properties

The existing TLA+ model (`docs/tla/rate-limiter.tla`) can be extended with:
- **Liveness**: Every request eventually gets a response (no starvation)
- **Bounded response**: Every response arrives within some time bound
- **Fairness**: The rate limiter doesn't permanently block any IP

### 4.2 Temporal Logic for Async Operations

For the client-side async flow (capture → analyze → submit):
- Eventual consistency: If a user completes all steps, submission succeeds
- Progress: Each step eventually completes or times out
- No deadlock: No step waits indefinitely for another

**Proposed TLA+ model:** `docs/tla/submission-protocol.tla`

### 4.3 Property-Based Testing for Timeouts

Using `fast-check` (already installed):
```js
fc.assert(
  fc.property(fc.integer({min: 1, max: 10}), (seconds) => {
    // For any reasonable timeout, the rate limiter should
    // allow at most 1 request per window
    const limiter = makeLimiter(seconds * 1000, 1);
    limiter.allow('test');
    return limiter.allow('test') === false; // blocked within window
  })
);
```

**Recommendation:** ➡ **IMPLEMENT** — Add to existing property-based tests.

---

## 5. Actionable Items Summary

| # | Issue | Severity | Effort | Decision |
|:-:|-------|:--------:|:------:|:--------:|
| 1 | **Submission check interval never cleared** | 🔴 HIGH | 5 min | **Implement** |
| 2 | **Fingerprint capture lacks progress** | 🔴 HIGH | 1 hr | **Implement** |
| 3 | **Blob write failure lacks rollback** | 🔴 HIGH | 30 min | **Implement** |
| 4 | **PoW challenge lacks progress feedback** | 🟡 MED | 30 min | **Implement** |
| 5 | **Blob archive is synchronous/blocking** | 🟡 MED | 30 min | **Implement** |
| 6 | ML training lacks checkpoint | 🟡 MED | 1 hr | **Defer** |
| 7 | TLA+ liveness properties | 🟢 LOW | 2 hrs | **Defer** |
| 8 | Property-based timeout tests | 🟢 LOW | 1 hr | **Defer** |
