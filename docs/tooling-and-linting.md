# Tooling, Linting & Automated Verification — Full Catalog

**Date:** 2026-07-14
**Scope:** All code (JS, Python, shell), configs, containers, dependencies, data

---

## Current State

| Tool | Status | What it checks |
|------|:------:|----------------|
| **ESLint v10** | ✅ Active | 22 built-in rules + 4 custom Scrutari rules |
| **Node `--test`** | ✅ Active | 61 unit tests across 9 suites |
| **Playwright (act)** | ✅ Active | E2E browser tests in CI containers |
| **npm audit** | ⬜ Not run | Dependency vulnerability scanning |
| **Prettier** | ⬜ Not configured | Code format consistency |
| **TypeScript/JSDoc** | ⬜ Not configured | Type-level correctness |
| **Property-based tests** | ⬜ Not configured | Randomized edge case discovery |
| **Mutation tests** | ⬜ Not configured | Test quality / coverage |
| **Container scanning** | ⬜ Not configured | Dockerfile best practices |
| **Shellcheck** | ⬜ Not configured | Shell script correctness |

---

## 1. ESLint — Built-in Rules to Enable

These are high-value built-in ESLint rules we should enable beyond what's already configured:

| Rule | Level | Why |
|------|:-----:|-----|
| `default-case` | warn | Switch statements should always have a default case |
| `eqeqeq` | error | Require `===` / `!==` (catch type coercion bugs) |
| `no-eval` | error | Prevent `eval()` — security risk |
| `no-extend-native` | error | Prevent modifying built-in prototypes |
| `no-extra-boolean-cast` | warn | Avoid `!!x` when `Boolean(x)` is clearer |
| `no-implicit-globals` | warn | Prevent accidental globals in script-mode files |
| `no-implied-eval` | error | `setTimeout`/`setInterval` with string arg |
| `no-loop-func` | warn | Functions in loops capture loop vars by reference |
| `no-multi-str` | warn | `\` line continuations are error-prone |
| `no-new-wrappers` | error | `new String(42)` not `String(42)` |
| `no-param-reassign` | warn | Mutating function parameters causes side effects |
| `no-redeclare` | error | Variable redeclaration (catches var hoisting bugs) |
| `no-return-assign` | warn | `return x = y` is usually a bug |
| `no-sequences` | warn | Comma operator `(a, b, c)` is often accidental |
| `no-throw-literal` | error | `throw` must use Error object, not string |
| `no-unneeded-ternary` | warn | `x ? true : false` → `Boolean(x)` |
| `no-useless-concat` | warn | `"a" + "b"` → `"ab"` |
| `prefer-const` | warn | `let` that's never reassigned should be `const` |
| `prefer-regex-literals` | warn | Use `/pattern/` not `new RegExp("pattern")` |
| `radix` | error | `parseInt()` must have radix parameter |
| `yoda` | warn | `if (x === 42)` not `if (42 === x)` |

## 2. Custom ESLint Rules — Scrutari-Specific

### Implemented (4 rules in `eslint/scrutari-plugin.js`)

| Rule | Level | What it catches |
|------|:-----:|-----------------|
| `scrutari/no-raw-ip-access` | warn | `req.socket.remoteAddress` without normalizeIP() |
| `scrutari/no-empty-catch` | warn | `catch(e) {}` without log/rethrow |
| `scrutari/require-strict-mode` | error (CJS) | CommonJS files missing `'use strict'` |
| `scrutari/require-normalize-ip-def` | error | IP-accessing files without normalizeIP() |

### Proposed (add to plugin, 5 more)

| Rule | Level | Implementation | Why |
|------|:-----:|:-------------:|-----|
| **`scrutari/require-archive-cleanup`** | warn | Static | Files with `archiveFile` logic must also have archive pruning. Prevents disk exhaustion. |
| **`scrutari/require-distribution-cap`** | error | Static | All `updateDistribution`/`updateDist` calls must include cardinality cap check. Prevents storage inflation. |
| **`scrutari/no-floating-promises`** | error | Static | All promise-returning calls must be awaited. Prevents unhandled rejections. |
| **`scrutari/require-rate-limit-first`** | warn | Heuristic | Request handlers should call rate limiting before processing data. Prevents bypass. |
| **`scrutari/no-direct-console-in-honeypot`** | warn | Static | Honeypot pages shouldn't log real client IPs to console in production. Privacy. |

## 3. Beyond ESLint — Additional Tooling

### 3.1 Prettier — Code Formatting (RECOMMENDED)

**What:** Auto-formats JS, JSON, Markdown, YAML to consistent style.

**Why:** The codebase has mixed formatting (tabs vs spaces in some files, inconsistent line lengths). Prettier eliminates formatting discussions and makes diffs cleaner.

**Config:**
```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 120,
  "tabWidth": 2
}
```

**CI integration:** `npx prettier --check .` as a non-blocking CI step.

**Effort:** ~30 min to set up; initial format pass may touch many files.

**Recommendation:** ➡ **IMPLEMENT** — Low effort, high consistency value.

### 3.2 JSDoc + `// @ts-check` — Type Checking (RECOMMENDED)

**What:** Add `// @ts-check` to JS files and annotate types with JSDoc comments. VS Code and `tsc --noEmit` will type-check without a build step.

**Target files (start here):**
- `lib/geo.js` — GeolocationResult class, getGeolocation interface
- `lib/storage.js` — StorageProvider + adapter interface
- `lib/providers/*.js` — Provider implementations
- `test/abstractions.test.mjs` — Type correctness of test values

**Example:**
```js
// @ts-check
/** @param {string} ip @returns {string} */
function normalizeIP(ip) { ... }
```

**Why not full TypeScript:** JSDoc gives 80% of TypeScript's value at 10% of the cost. No build step, no configuration, no type definition files. Works with VS Code's built-in TypeScript checker.

**Effort:** ~1 day for the core lib/ files. Add incrementally.

**Recommendation:** ➡ **IMPLEMENT** — Add `// @ts-check` to `lib/` directory first.

### 3.3 Property-Based Testing (fast-check) — HIGH VALUE

**What:** Instead of writing specific test cases, describe invariants that should always hold and let the library generate random inputs.

**Scrutari use cases:**

```js
// Rate limiter invariant: first request from any IP is always allowed
fc.assert(
  fc.property(fc.ipV4(), fc.integer({ min: 0 }), (ip, time) => {
    const limiter = new SlidingWindowRateLimiter(5000, 1);
    return limiter.allow(ip) === true;
  })
);

// normalizeIP invariant: idempotent for all valid IPs
fc.assert(
  fc.property(fc.oneof(fc.ipV4(), fc.ipV6()), (ip) => {
    return normalizeIP(normalizeIP(ip)) === normalizeIP(ip);
  })
);

// Schema validation invariant: any object with version >= 1 passes basic validation
fc.assert(
  fc.property(fc.object(), (obj) => {
    const result = schemaValidate({ version: 1, ...obj });
    // Should never throw, returns either null or string[]
    return result === null || Array.isArray(result);
  })
);
```

**Install:** `npm install --save-dev fast-check`

**Recommendation:** ➡ **IMPLEMENT** — Add to rate limiter and normalizeIP tests. ~4 hours.

### 3.4 npm audit — Dependency Vulnerability Scanning (ESSENTIAL)

**What:** `npm audit` checks the dependency tree against known vulnerabilities.

**Current state:** Hasn't been run. Let me check now.

```bash
npm audit          # Check vulnerabilities
npm audit fix      # Auto-fix safe upgrades
npm outdated       # Check for newer versions
```

**CI integration:** Add `npm audit --audit-level=high` as a blocking CI step.

**Recommendation:** ➡ **IMPLEMENT** — Run now, add to CI.

### 3.5 Hadolint — Dockerfile Linting (RECOMMENDED)

**What:** Lints Dockerfiles for best practices (unpinned versions, missing labels, security issues).

**Scrutari Dockerfiles:**
- `submit-endpoint/Dockerfile` — Node.js standalone server
- `automation/training/Dockerfile` — Python ML training

**Rules it would catch:**
- Missing `HEALTHCHECK` instruction
- Missing `--no-cache-dir` for pip (Python Dockerfile already has this ✅)
- Running as root (both currently run as root)

**Usage:** `docker run --rm -v $PWD:/workspace hadolint/hadolint hadolint submit-endpoint/Dockerfile`

**Recommendation:** ➡ **DEFER** — Valuable but low urgency. Track as GitHub issue.

### 3.6 shellcheck — Shell Script Linting (RECOMMENDED)

**What:** Lints bash/sh scripts for common bugs: unquoted variables, missing error handling, POSIX violations.

**Scrutari shell scripts:**
- `ci-local.sh` — Local CI runner
- `submit-endpoint/deploy-netlify.sh` — Deploy script
- `automation/run-weekly-baselines.sh` — Weekly scheduler
- `automation/*.sh` — Various helpers

**Install:** `winget install koalaman.shellcheck` (Windows) or `apt install shellcheck` (WSL2)

**CI integration:** `shellcheck ci-local.sh submit-endpoint/deploy-netlify.sh`

**Recommendation:** ➡ **IMPLEMENT** — Quick win, catches real bugs in shell scripts.

### 3.7 knip — Dead Code Detection (RECOMMENDED)

**What:** Finds unused files, exports, and dependencies. Especially valuable for the `lib/` directory as it grows.

**Install:** `npm install --save-dev knip`

**What it would find:**
- Unused exports in utility modules
- Files that are never imported anywhere
- Dependencies in `package.json` that nothing actually uses

**Recommendation:** ➡ **DEFER** — Most valuable after the `lib/` directory stabilizes.

### 3.8 Stryker — Mutation Testing (NICE TO HAVE)

**What:** Introduces small bugs (mutations) into the code and checks whether tests catch them. Measures test quality, not just coverage.

**Scrutari use:** Our 61 tests have 0 failures. Mutation testing would tell us whether those 61 tests actually catch real bugs or just assert the current behavior.

**Effort:** ~1 day to configure, runs can be slow.

**Recommendation:** ➡ **DEFER** — Valuable for test quality, but not urgent for a research platform.

### 3.9 `docker scout` / Trivy — Container Scanning (NICE TO HAVE)

**What:** Scans Docker images for known CVEs in the base image layers.

**Usage:** `docker scout quickview scrutari-ml-trainer:1.0.0`

**Recommendation:** ➡ **DEFER** — Important before production deployment, not critical for research.

---

## 4. Summary: What to Implement Now vs This Sprint vs Defer

| # | Tool / Rule | Effort | When | Decision |
|:-:|-------------|:------:|:----:|:--------:|
| 1 | **Enable 21 more ESLint built-in rules** | 30 min | Now | **Implement** |
| 2 | **Add 5 more custom ESLint rules** | 2 hrs | Now | **Implement** |
| 3 | **Run npm audit** | 10 min | Now | **Implement** |
| 4 | **Prettier config** | 30 min | Sprint | **Implement** |
| 5 | **JSDoc + @ts-check on lib/** | 1 day | Sprint | **Implement** |
| 6 | **Property-based tests (fast-check)** | 4 hrs | Sprint | **Implement** |
| 7 | **shellcheck integration** | 1 hr | Sprint | **Implement** |
| 8 | **npm audit in CI** | 30 min | Sprint | **Implement** |
| 9 | **Hadolint** | 1 hr | Defer | Track as issue |
| 10 | **knip (dead code)** | 1 hr | Defer | Track as issue |
| 11 | **Stryker (mutation)** | 1 day | Defer | Track as issue |
| 12 | **Docker Scout / Trivy** | 1 hr | Defer | Track as issue |
