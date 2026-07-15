# Invariants & Properties Audit — Formal Verification

**Date:** 2026-07-15

---

## 1. Inventory of All System Invariants

### 1.1 Rate Limiter (Formally Verified ✅)

| Invariant | Definition | Verified By |
|-----------|-----------|:-----------:|
| **InvRateLimited** | At most MaxPerWindow requests per IP per window | TLA+ (TLC) |
| **InvSorted** | Timestamp sequences are sorted ascending per IP | TLA+ (TLC) |
| **InvTimely** | All stored timestamps are within [Now - Window, Now] | TLA+ (TLC) |

**TLC result:** 1,365 distinct states, no error found. Collision probability 3.3E-14.

**Property-based tests:** 7 fast-check tests for liveness (expired window), fairness (IP independence), bounded wait.

### 1.2 Submission Schema (Enforced at Runtime)

| Invariant | Enforcement | Method |
|-----------|:-----------:|--------|
| `data.version` must be a number >= 1 | ✅ Runtime | `schemaValidate()` in server.js + submit.mjs |
| `data.source` must be in ALLOWED_SOURCES | ✅ Runtime | Array.includes check |
| Body size must not exceed MAX_BODY_BYTES | ✅ Runtime | Content-length check before parse |
| Request rate must not exceed RATE_LIMIT_MS | ✅ Runtime | Sliding window rate limiter |

### 1.3 PoW Challenge-Response (Cryptographic)

| Invariant | Enforcement | Method |
|-----------|:-----------:|--------|
| Challenge is unique per request | ✅ | `crypto.randomBytes(32)` |
| Challenge expires after TTL | ✅ | `setTimeout(() => challenges.delete(), CHALLENGE_TTL)` |
| Nonce must be valid for challenge+difficulty | ✅ Server-side | `verifyPoW()` recomputes SHA-256 |
| Same nonce cannot be reused (replay) | ✅ | Challenge deleted after use |

### 1.4 Data Consistency (Partial Enforcement)

| Invariant | Enforcement | Risk |
|-----------|:-----------:|:----:|
| Dedup hash is deterministic | ✅ | Same input → same hash (pure function) |
| Dedup hash has no collisions | 🟡 Probabilistic | 64-bit truncation, P(collision) < 2.7E-8 for N<10M |
| Distribution counts = sum of submissions | 🟡 EVENTUAL | Race condition in blob store (see below) |
| Archive preserves data integrity | 🟡 | Atomic write (tmp→rename), but no checksum |
| Submissions from same sessionID have consistent hardware | ❌ NOT CHECKED | No longitudinal consistency check |

### 1.5 Client-Side Behavioral Recording

| Invariant | Enforcement | Risk |
|-----------|:-----------:|:----:|
| Event arrays bounded | ✅ | Per-array caps (mouse=5000, scroll=500, etc.) |
| Event listeners cleaned up on stop | ✅ | `removeEventListener` called for all listeners |
| Double-start is safe | ✅ | `if (__behavior.running) return;` guard |
| Stop when not running is safe | ✅ | `if (!__behavior.running) return;` guard |

### 1.6 Missing Invariants (Gaps)

| Missing Invariant | Risk | Why Missing |
|------------------|:----:|-------------|
| **Deduplication is atomic** | 🔴 HIGH | Read-modify-write in server.js can lose updates under concurrent requests |
| **Distribution counts are consistent** | 🟡 MED | Same race condition affects distribution updates |
| **Fingerprint consistency across sessions** | 🟡 MED | Same sessionID can have different hardware profiles (no cross-check) |
| **PoW timing vs hardware correlation** | 🟢 LOW | Collected but not enforced as invariant |
| **Schema version migration** | 🟢 LOW | No backward compatibility tests for schema changes |

---

## 2. Atomicity Requirements

### 2.1 Actions That Should Be Atomic

| Action | Currently Atomic? | Fix |
|--------|:----------------:|-----|
| **loadStore → modify → saveStore** | ❌ No | In-process mutex for server.js, optimistic versioning for serverless |
| **Archive: copy → reset → save → prune** | 🟡 Partial | Atomic on individual steps, not transactionally |
| **PoW challenge: store → respond** | ✅ Yes | Single synchronous operation |
| **Rate limiter: check → allow/deny** | ✅ Yes | Single-threaded, no await between check and store |
| **Session: create → send → confirm** | ❌ No | No retry logic for failed submissions |

### 2.2 Proposed Atomic Operations

**In-process mutex for server.js:**
```js
class Mutex {
  constructor() { this._queue = []; this._locked = false; }
  async acquire() {
    return new Promise(resolve => {
      if (!this._locked) { this._locked = true; resolve(); }
      else this._queue.push(resolve);
    });
  }
  release() {
    if (this._queue.length > 0) this._queue.shift()();
    else this._locked = false;
  }
}
```

**Optimistic versioning for serverless:**
```js
const MAX_RETRIES = 3;
for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
  const current = await store.get('store.json');
  const updated = { ...current, version: current.version + 1 };
  // Atomic conditional write (if supported by provider)
  // Otherwise accept best-effort
}
```

---

## 3. Language Features for Invariant Enforcement

### 3.1 Already Using

| Feature | Where | Invariant |
|---------|-------|-----------|
| `const` declarations | All modern JS files | Prevents reassignment |
| `"use strict"` | `server.js` | Prevents undeclared variables |
| ES module strict mode | All `.mjs` files | Automatic strict mode |
| `assert.strictEqual` | All tests | Type-safe equality checks |
| `typeof` checks | `schemaValidate()` | Type safety for submission payload |

### 3.2 Recommended Additions

| Feature | Effort | Benefit | Decision |
|---------|:------:|:-------:|:--------:|
| `Object.freeze()` on config objects | 1 hr | Prevents runtime modification of constants | **Implement** |
| `// @ts-check` on `lib/` | 1 day | Catches type errors at dev time | **Defer** |
| Schema version migration tests | 2 hrs | Ensures backward compat | **Defer** |
| `MAX_RETRIES` constant for blob writes | 15 min | Bounded retry on write failure | **Implement** |

---

## 4. Formal Tools & Methods

### 4.1 Currently Applied

| Tool | Scope | Status |
|------|-------|:------:|
| **TLA+ / TLC** | Rate limiter (3 invariants) | ✅ Model checked, no errors |
| **fast-check** | Rate limiter, normalizeIP, schema, temporal | ✅ 20+ property-based tests |
| **ESLint** | All JS files, 9 custom rules | ✅ 0 errors |
| **OPSEC regression suite** | 5 invariant categories, 13 tests | ✅ 61 tests |

### 4.2 Recommended Additions

| Tool | Scope | Effort | Decision |
|------|-------|:------:|:--------:|
| **TLA+ for submission protocol** | Browser↔server handshake | 4 hrs | **Defer** |
| **Alloy Analyzer** | Data model consistency | 3 hrs | **Defer** |
| **Invariant regression tests** | Add to CI pipeline | 1 hr | **Implement** |
| **Mutex for server.js** | Atomic store operations | 1 hr | **Implement** |

---

## 5. Actionable Items

| # | Item | Severity | Effort | Recommendation |
|:-:|------|:--------:|:------:|:-------------:|
| 1 | **Add in-process mutex to server.js** (atomic store) | 🔴 HIGH | 1 hr | **Implement** |
| 2 | **Add MAX_RETRIES to blob writes** (bounded retry) | 🟡 MED | 15 min | **Implement** |
| 3 | **Object.freeze() on config constants** | 🟢 LOW | 1 hr | **Implement** |
| 4 | **Invariant regression tests in CI** | 🟡 MED | 1 hr | **Implement** |
| 5 | **Optimistic versioning for serverless** | 🟡 MED | 2 hrs | **Defer** |
| 6 | **TLA+ for submission protocol** | 🟢 LOW | 4 hrs | **Defer** |
| 7 | **Alloy data model** | 🟢 LOW | 3 hrs | **Defer** |
| 8 | **Longitudinal consistency checks** | 🟡 MED | 2 days | **Defer** |
