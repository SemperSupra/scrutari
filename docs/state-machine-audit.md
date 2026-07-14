# State Machine Audit — Correctness, Completeness & Formal Verification

**Date:** 2026-07-14
**Scope:** UI/UX, API lifecycle, submission protocol, system lifecycle, honeypot/tarpit

---

## 1. UI/UX State Machine (Browser SPA)

### Documented States (from `automation/state-machine.md`)

```
LANDING → NETWORK_ANALYSIS → FINGERPRINT_CAPTURING → FINGERPRINT_COMPLETE
  → WEBRTC_TESTING → WEBRTC_COMPLETE → BEHAVIOR_IDLE → BEHAVIOR_RECORDING
  → BEHAVIOR_COMPLETE → RESULTS_OVERVIEW → SUBMISSION_READY
  → SUBMISSION_SENDING → SUBMISSION_SENT
```

### Missing States (not documented but present in code)

| Missing State | Where | Why It Matters |
|---------------|-------|----------------|
| **ERROR_FINGERPRINT** | `captureFingerprint()` try/catch | Fingerprint capture can fail silently (many `catch(e)` blocks that log nothing) |
| **ERROR_BEHAVIOR_ANALYSIS** | `analyzeBehavior()` try/catch in each `t()` call | Individual signal analysis can throw, caught silently |
| **ERROR_SUBMISSION** | `submitResults()` try/catch | Network errors, 400/500 responses caught and shown to user |
| **ERROR_WEBRTC** | `runWebRTCTests()` | STUN server timeouts, browser API failures |
| **BEHAVIOR_RECORDING_RESTART** | `toggleBehaviorRecording()` | Calling start while already running resets all state |

### Non-Idempotent Transitions

| Transition | Non-Idempotent Behavior | Risk |
|-----------|------------------------|:----:|
| `startBehaviorRecording()` twice | Overwrites `__behavior`, first `setTimeout`/`setInterval` still fire on stale state. Event listeners are duplicated (unused because handler checks `__behavior.running`). | LOW — handlers are guarded |
| `navigateTo()` same section twice | `scrollIntoView` called again, hash set again. Progress bar re-classed to same state. | NONE — purely cosmetic |
| `captureFingerprint()` twice | Re-runs all async tests, overwrites `__lastFingerprintData`. Duplicates `setInterval` submission check. | MEDIUM — duplicate interval |
| `submitResults()` after success | Button disabled, endpoint called again. Server deduplicates by fingerprint hash. | LOW — server handles dedup |

### Gap: Double-recording race condition — MEDIUM

**Code:** `startBehaviorRecording()` (line 2210-2261), `toggleBehaviorRecording()` (line 2183)

**Problem:** `toggleBehaviorRecording` calls `startBehaviorRecording()` without checking if already running. If the user clicks "Start" twice rapidly before the first `setTimeout` fires:
1. First call: starts recording, sets `setTimeout(stopBehaviorRecording, 15000)`
2. Second call: resets `__behavior` (clears event arrays), sets NEW `setTimeout`
3. After 15s: first `setTimeout` fires → `stopBehaviorRecording()` checks `__behavior.running` (which is now false because second call already handled it) → returns
4. After 15s + 100ms: second `setTimeout` fires → same, returns
5. Recording never actually stops (both timeouts skip)

**Fix:** Guard `startBehaviorRecording()` with `if (__behavior.running) return;` at the top.

**Recommendation:** ➡ **IMPLEMENT** — 1-line fix.

### Gap: No error state for WebRTC timeout — LOW

**Code:** `runWebRTCTests()` (line 1974)

**Problem:** The 4 STUN techniques each have individual timeouts, but there's no overall timeout wrapping the entire test. If all 4 techniques time out, the user sees "Running..." indefinitely.

**Fix:** Add a 15-second overall timeout that shows "WebRTC test timed out" message.

**Recommendation:** ➡ **IMPLEMENT** — 5 minute fix.

---

## 2. API Lifecycle State Machine (Server/Serverless)

### Request States

```
RECEIVE → VALIDATE → RATE_LIMIT → PROCESS → RESPOND
           │            │           │
           ▼            ▼           ▼
        REJECT_400   REJECT_429  REJECT_500
```

### Current Implementation

```
RECEIVE
  │
  ├─ Content-Type check → REJECT_400 (if not POST JSON)
  ├─ Body size check → REJECT_413 (if > 100KB)
  │
  ▼
VALIDATE (schemaValidate)
  │
  ├─ Missing version → REJECT_400
  ├─ Invalid source → REJECT_400
  ├─ Schema errors → REJECT_400
  │
  ▼
RATE_LIMIT (rateLimiter.allow)
  │
  ├─ Rate limited → REJECT_429
  │
  ▼
PROCESS (loadStore → modify → saveStore)
  │
  ├─ Blob write error → logs error, still returns 200 (data loss!)
  │
  ▼
RESPOND (200 with stats)
```

### Gap: Silent data loss on blob write failure — MEDIUM

**Code:** `submit-endpoint/netlify/functions/submit.mjs` line 186-188

```js
try {
  await store.set(BLOB_NAME, JSON.stringify(db));
} catch (e) {
  console.log(`[Scrutari] Blob write error: ${e.message}`);
}
```

**Problem:** If the blob write fails, the response still says `status: 'ok'` and
increments the submission counter. The data is lost silently.

**Fix:** Re-throw after logging, or return a 500 status so the client knows to retry.

**Recommendation:** ➡ **IMPLEMENT** — Change `console.log` to `throw e`.

### Gap: Archiving is synchronous and blocking — LOW

**Code:** Both `server.js` saveStore and `submit.mjs`

**Problem:** When the store exceeds 800MB, the entire archiving process
(copy file → reset → save → prune) runs synchronously during the request.
A submission that triggers archiving will have ~500ms+ latency.

**Fix:** Defer archiving to a background process or after response is sent.

**Recommendation:** ➡ **DEFER** — Not a correctness issue, only performance.
Track as GitHub issue.

---

## 3. Submission Protocol State Machine (Browser ↔ Server)

### States

```
BROWSER                    SERVER
  │                          │
  ├─ GET /api/challenge ────►├─ Generate challenge
  │◄── { challenge, ttl } ──┤
  │                          │
  ├─ Compute PoW (SHA-256)  │
  │  (not yet implemented)  │
  │                          │
  ├─ POST /api/submit ──────►├─ Validate schema
  │   { fp, challenge,      ├─ Rate limit
  │     nonce, version }    ├─ Verify PoW (not yet)
  │                          ├─ Dedup fingerprint
  │                          ├─ Update distributions
  │                          ├─ Save blob
  │◄── { status, stats } ───┤
```

### Gap: PoW challenge-response not yet implemented — MEDIUM

**Status:** The PoW benchmark exists in `index.html` (SHA-256 hash computation)
but it's a measurement only. The server doesn't issue challenges and doesn't
verify proofs. This means submissions have no proof of JS execution.

**Already documented in PR 1.4** (deferred pending calibration experiment data).

**Recommendation:** ➡ **DEFER** — Tracked in backlog. Needs calibration data.

### Submission Retry States (current behavior)

```
SEND ──► Network error ──► "Retry" button shown
  │         │
  │         └── User clicks "Retry" ──► SEND again (same data)
  │
  ├──► HTTP 429 ──► "Rate limited" message
  ├──► HTTP 400 ──► Schema error message
  ├──► HTTP 413 ──► Body too large message
  └──► HTTP 200 ──► "Thank you" + stats
```

### Gap: No automatic retry on 429/500 — LOW

**Code:** `submitResults()` in `index.html`

**Problem:** If the server returns 429 (rate limited) or 500 (server error), the
user sees a failure message. For 429, a simple retry-after delay would resolve it.

**Fix:** On 429, automatically retry after 5 seconds with exponential backoff.

**Recommendation:** ➡ **IMPLEMENT** — Simple UX improvement.

---

## 4. System Lifecycle State Machine

### Deployment States

```
DEV (static server, port 8765)
  │
  ├─ npm test ──► Local validation
  │
  ├─ bash ci-local.sh ──► Full CI (act via WSL2)
  │
  ├─ bash submit-endpoint/deploy-netlify.sh ──► STAGING (Netlify preview)
  │
  └─ (netlify.toml auto-deploy) ──► PRODUCTION (Netlify live)
```

### Data Collection Pipeline States

```
COLLECT (SPA submissions + honeypot + baselines)
  │
  ▼
DEDUP (SHA-256 hash, frequency counters)
  │
  ▼
STORE (Netlify Blob / local filesystem)
  │
  ├─ Size > 800MB? ──► ARCHIVE (copy + reset + prune)
  │
  ▼
ANALYZE (/api/analysis computes entropy, confusion matrix)
  │
  ▼
TRAIN (ML pipeline: feature extraction → Random Forest → ONNX export)
  │
  ▼
DEPLOY (model → Netlify Blob → ONNX Runtime Web in browser)
```

### Gap: No automatic model deployment pipeline — MEDIUM

**Problem:** The ML training pipeline runs manually. Trained models must be
manually uploaded to Netlify Blob. There's no CI/CD for model deployment.

**Fix:** Add a GitHub Actions workflow that runs ML training on new data
and deploys the model to Netlify Blob.

**Recommendation:** ➡ **DEFER** — Track as GitHub issue. Needs 100+ training samples first.

---

## 5. Honeypot/Tarpit State Machine

### Visit Progression

```
FIRST_VISIT
  │
  ├─ Set __hp_visit=1 cookie
  ├─ Show login page (trap)
  │
  ▼
REPEAT_VISIT (visit increments 1→2→3...)
  │
  ├─ Show admin dashboard (visit 1-5)
  ├─ Show sensitive data (visit 5-10)
  ├─ Show billing/team data (visit 10-15)
  └─ Content drift: usernames, dates, data values change per visit
  │
  ▼
STALE (visit ≥ 20, capped by Math.min)
```

### Tarpit Engagement Stages

```
STAGE 1: Initial Interest (visits 1-3)
  Login page → Admin dashboard → User list
  Goals: Make bot think it found a real app

STAGE 2: Deep Engagement (visits 4-10)
  Settings → Billing → Team members (with diurnal cycles)
  Goals: Keep bot crawling, collect behavioral data

STAGE 3: Content Saturation (visits 11-20)
  All paths return consistent data with drifting values
  Goals: Maximize time spent, minimize detection
```

### Gap: No "tarpit escape" detection — LOW

**Problem:** The honeypot doesn't detect when a bot has stopped visiting
or when it has "escaped" the tarpit. There's no feedback loop to the
operator.

**Fix:** Add a metric for "average visit depth per IP" — if IPs consistently
reach only visit 1-2, the tarpit isn't engaging.

**Recommendation:** ➡ **DEFER** — Nice to have. Track as GitHub issue.

---

## 6. Holistic State Machine (All Layers Combined)

```
┌─────────────────────────────────────────────────────────────────────┐
│                     SYSTEM LIFECYCLE                                 │
│  DEPLOY ──► COLLECT ──► DEDUP ──► STORE ──► ANALYZE ──► TRAIN      │
│                           │                          │               │
│                    ┌──────┴──────┐           ┌───────┴───────┐       │
│                    ▼             ▼           ▼               ▼       │
│               BLOB_STORE   LOCAL_FS    ANALYSIS_API    ONNX_MODEL    │
│                    │                                          │       │
│                    └──────────────────┬─────────────────────────┘     │
│                                       │                              │
│  ┌────────────────────────────────────┴─────────────────────────┐     │
│  │                   SUBMISSION PROTOCOL                         │     │
│  │  BROWSER: Idle → Capturing → Complete → Submit → Sent        │     │
│  │  SERVER:  Receive → Validate → RateLimit → Store → Respond   │     │
│  └──────────────────────────────────────────────────────────────┘     │
│                         │                                            │
│  ┌──────────────────────┴────────────────────────────────────────┐    │
│  │                      UI/UX LIFECYCLE                           │    │
│  │  LANDING → NETWORK → FINGERPRINT → WEBRTC → BEHAVIOR → DONE  │    │
│  └───────────────────────────────────────────────────────────────┘    │
│                         │                                            │
│  ┌──────────────────────┴────────────────────────────────────────┐    │
│  │                    HONEYPOT LIFECYCLE                          │    │
│  │  FIRST_VISIT → REPEAT (1..20) → Content drift per visit      │    │
│  │  Bot vs human UA → tracking stripped for human visitors       │    │
│  └───────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 7. Formal Verification Opportunities

### 7.1 TLA+ Model for Rate Limiter (EXISTING)

Already implemented at `docs/tla/rate-limiter.tla`. Defines 3 invariants:
- `InvRateLimited`: at most MaxPerWindow requests per IP per window
- `InvSorted`: timestamp arrays are sorted ascending
- `InvTimely`: all timestamps are within the current window

**Next step:** Run the TLC model checker to verify the invariants hold
for all possible states. ~2 hours of work.

**Recommendation:** ➡ **IMPLEMENT** — Already written, just needs TLC run.

### 7.2 TLA+ Model for Submission Protocol (PROPOSED)

Could model the browser↔server interaction as a TLA+ spec:
- States: Idle, ChallengeIssued, PoWComputing, SubmitSent, Acknowledged, Error
- Invariant: No submission is acknowledged without valid PoW
- Invariant: No duplicate submissions are double-counted

**Recommendation:** ➡ **DEFER** — Until PoW challenge-response is implemented.

### 7.3 State Machine Invariant Tests (PROPOSED)

Add to `test/opsec-regression.test.mjs`:

```js
// Behavioral recording invariant: startBehaviorRecording() when already
// running must not create duplicate event listeners
function testStartWhileRunning() {
  const beforeCount = getEventListenerCount('mousemove');
  startBehaviorRecording();
  startBehaviorRecording(); // second call while running
  const afterCount = getEventListenerCount('mousemove');
  return afterCount <= beforeCount + 1; // at most one mousemove listener
}
```

**Recommendation:** ➡ **IMPLEMENT** — 2 hours, high value for regression protection.

### 7.4 State Machine Diagram as Executable Code (PROPOSED)

The UI/UX state machine from `automation/state-machine.md` is documentation-only.
It's not synced with the code. Consider using **XState** (industry standard)
to define the state machine as executable code:

```js
import { createMachine } from 'xstate';
const scrutariUI = createMachine({
  id: 'scrutari-ui',
  initial: 'landing',
  states: {
    landing: { on: { NAVIGATE: 'fingerprint_capturing' } },
    fingerprint_capturing: { on: { CAPTURE_COMPLETE: 'fingerprint_complete' } },
    // ...
  }
});
```

**Trade-off:** XState adds ~10KB to the bundle. Requires refactoring the
navigation/behavioral code to use the state machine instead of ad-hoc
function calls. This is a significant refactor.

**Recommendation:** ➡ **DEFER** — Too invasive for current phase.
Track as GitHub issue with XState evaluation.

### 7.5 Alloy Analyzer for Data Model Consistency (PROPOSED)

Alloy can verify submission data model constraints:
- Every submission has exactly one source (manual or automation_*)
- Fingerprint hash is deterministic given the same attributes
- Distribution counts are consistent with total submission count

**Recommendation:** ➡ **DEFER** — Low incremental value over existing tests.

---

## 8. State Transition Observability

### What's Currently Logged

| Transition | Logged? | Where |
|-----------|:-------:|-------|
| UI navigation | ❌ | No logging |
| Fingerprint capture start/complete | ❌ | No logging |
| Behavioral recording start/stop | ❌ | No logging |
| Submission start/success/failure | 🟡 In UI only | `submit-result-msg` div |
| API request received | ✅ | `[Scrutari] #N | unique: M ...` |
| API validation failure | ❌ | Returns error but no log |
| API rate limit hit | ❌ | Returns 429 but no log |
| Blob write error | ✅ | `[Scrutari] Blob write error:` |
| Archive event | ✅ | `Archived store to ...` |
| Honeypot visit | ✅ | `[Honeypot] Visit #N: ...` |
| Tor exit list update | ✅ | `Tor exit list updated: ...` |

### Gap: No structured logging — MEDIUM

**Problem:** Logs are `console.log` strings, not structured JSON. No log levels
(debug/info/warn/error). No correlation IDs to trace a single submission through
the pipeline.

**Fix options:**
- **A:** Add correlation ID (`x-request-id`) header to every API response.
  Log all transitions with this ID. Minimal effort, high value for debugging.
- **B:** Add a structured logging helper that outputs JSON lines.

**Recommendation:** ➡ **IMPLEMENT Option A** — Add request ID + structured log
format. ~2 hours.

---

## 9. Actionable Items Summary

| # | Issue | Severity | Effort | Recommendation | Decision |
|:-:|-------|:--------:|:------:|:-------------:|:--------:|
| 1 | **Double-recording race** | HIGH | 5 min | Guard `startBehaviorRecording()` with `if (__behavior.running) return;` | **Implement** |
| 2 | **Silent blob write failure** | MEDIUM | 5 min | Re-throw after logging instead of returning 200 | **Implement** |
| 3 | **Missing error state for WebRTC timeout** | LOW | 5 min | Add 15s overall timeout to `runWebRTCTests()` | **Implement** |
| 4 | **No automatic retry on 429/500** | LOW | 30 min | Add retry-after delay in `submitResults()` | **Implement** |
| 5 | **State machine invariant tests** | MEDIUM | 2 hrs | Add to `test/opsec-regression.test.mjs` | **Implement** |
| 6 | **TLA+ model checker run** | LOW | 2 hrs | Run TLC on `docs/tla/rate-limiter.tla` | **Implement** |
| 7 | **Request correlation ID + structured logging** | MEDIUM | 2 hrs | Add `x-request-id` header, JSON log format | **Implement** |
| 8 | **Defer archiving to background** | LOW | 1 day | Don't block submission on archive | **Defer** |
| 9 | **XState migration** | LOW | 3 days | Executable state machine for UI/UX | **Defer** |
| 10 | **TLA+ for submission protocol** | LOW | 4 hrs | Model browser↔server interaction | **Defer** |
| 11 | **Model auto-deployment pipeline** | LOW | 1 day | CI/CD for ML model deployment | **Defer** |
| 12 | **Alloy data model verification** | LOW | 3 hrs | Verify submission schema consistency | **Defer** |
| 13 | **Honeypot escape detection** | LOW | 1 day | Feedback loop for tarpit effectiveness | **Defer** |

## 10. State/Code Synchronization

### Currently Sync'd
- `automation/state-machine.md` ↔ `automation/state-machine-tests.mjs` — tests
  validate the documented transitions (35 tests, mapped in the doc)

### NOT Sync'd
- `automation/state-machine.md` does NOT include error states, API states,
  submission protocol states, or system lifecycle states
- `automation/state-machine.md` does NOT reference the TLA+ model
- The behavioral recording state machine (start/stop/toggle) is NOT documented
- The honeypot visit progression is NOT formally documented as a state machine

### Cross-Reference Matrix

| State Machine | Documented | Formally Modeled | Tested | Sync'd with Code |
|---------------|:----------:|:----------------:|:-----:|:----------------:|
| UI/UX Wizard | ✅ `state-machine.md` | ❌ | ✅ 35 tests | ✅ |
| Behavioral Recording | ❌ | ❌ | 🟡 Partial (2 tests) | ❌ |
| Submission Protocol | ❌ | ❌ | ❌ | ❌ |
| API Lifecycle | ❌ | ❌ | ❌ | ❌ |
| System Lifecycle | ❌ | ❌ | ❌ | ❌ |
| Honeypot/Tarpit | ❌ | ❌ | ✅ 88 tests | 🟡 Partial |
| Rate Limiter | ❌ | ✅ TLA+ model | ✅ 7 tests | ✅ |
