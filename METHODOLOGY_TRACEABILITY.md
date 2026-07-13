# Methodology Traceability Matrix

Each code component maps to a specific research methodology function.

## Detection Signals → Code Locations

| Methodology | Signal | Code Location | Weight |
|-------------|--------|---------------|:------:|
| **Static fingerprint** | navigator.webdriver | `index.html` line ~1088 | w5 |
| | Automation framework globals | `index.html` line ~1090-1100 | w5 |
| | Iframe webdriver leak | `index.html` line ~1110 | w5 |
| | Canvas/WebGL/GPU fingerprint | `index.html` line ~770-860 | w4 |
| | Font enumeration | `index.html` line ~805-830 | w4 |
| | Screen resolution anomalies | `index.html` line ~1140 | w3 |
| | CSS engine probes | `index.html` line ~1250 | w1 |
| | IPv6/DNS detection | `index.html` line ~1270 | w2 |
| | Device classification | `index.html` line ~1260 | w1 |
| | Browser version detection | `index.html` line ~1265 | w1 |
| | Gamepad detection | `index.html` line ~1193 | — |
| | Sensor API detection | `index.html` line ~1245 | — |
| **Behavioral** | Mouse speed variance | `index.html` line ~2140 | w4 |
| | Mouse path curvature | `index.html` line ~2146 | w4 |
| | Velocity profile (BeCAPTCHA) | `index.html` line ~2203 | w4 |
| | Trajectory optimality | `index.html` line ~2215 | w3 |
| | Overshoot corrections | `index.html` line ~2230 | w3 |
| | Scroll reading pauses | `index.html` line ~2262 | w3 |
| | Scroll pattern (FP-Agent) | `index.html` line ~2282 | w3 |
| | Typing speed variance | `index.html` line ~2397 | w3 |
| | Typing corrections (backspace) | `index.html` line ~2493 | w2 |
| | Paste detection (FP-Agent) | `index.html` line ~2354 | w3 |
| | Touch interaction | `index.html` line ~2348 | w1 |
| | Sensor realism | `index.html` line ~2352-2390 | w2-3 |
| **Honeypot** | Hidden field fill (input-ext) | `index.html` line ~2480 | w4 |
| | Decoy button clicks (btn-opt) | `index.html` line ~2489 | w3 |
| | Visible trap button (verify-btn) | `index.html` line ~1823 | — |
| | Hidden trap button (hidden-access-btn) | `index.html` line ~1826 | — |
| **Honeypot pages** | 35+ fake application pages | `netlify/edge-functions/honeypot.js` | — |
| | Visit tracking (__hp_visit cookie) | `honeypot.js` line ~59-65 | — |
| | Diurnal team status | `honeypot.js` line ~335-370 | — |
| | LLM prompt injection | `honeypot.js` line ~72-74 | — |
| | GraphQL introspection | `honeypot.js` line ~632-660 | — |
| | WordPress probes | `honeypot.js` line ~662-670 | — |

## Data Pipeline → Code Locations

| Component | Code | Purpose |
|-----------|------|---------|
| Submission endpoint | `submit-endpoint/netlify/functions/submit.mjs` | Receives + deduplicates fingerprint data |
| Analysis API | `submit-endpoint/netlify/functions/analysis.mjs` | Computes entropy, confusion matrix |
| Published baselines | `analysis.mjs` line ~130-140 | Eckersley (2010), Berke (2025) |
| GeoIP classification | `netlify/edge-functions/classify.js` | Replaces ipinfo.io |
| ML training | `automation/train_model.py` | Random Forest → ONNX |
| SapiMouse dataset | `training_data/sapimouse/` | 120 users, mouse dynamics pre-training |

## Test Infrastructure → Code Locations

| Test Suite | File | Tests | What It Validates |
|------------|------|:-----:|-------------------|
| State Machine | `automation/state-machine-tests.mjs` | 35 | UI/UX transitions, valid + invalid flows |
| Honeypot | `automation/honeypot-tests.mjs` | 88 | 35+ paths, brand consistency, tracking |
| Fingerprint baselines | `automation/baselines.mjs` | 7 | Browser configs, Bot-or-Not scores |
| Behavioral baselines | `automation/baselines.mjs` | 2 | Bot + human simulation scores |
| Cross-reference | `automation/cross-reference.mjs` | 3 | Scrutari vs EFF vs BrowserLeaks |
| ML training | `automation/train_model.py` | — | end-to-end pipeline validation |

## Research Methodology → Code Locations

| Methodology Component | Code | Status |
|----------------------|------|:------:|
| Detector versioning | `index.html` `detectorVersion` field | ✅ |
| Ground truth labeling | `source` field in submissions | ✅ |
| Deduplication + frequency | `submit.mjs` SHA-256 hash + counters | ✅ |
| Marginal distributions | `submit.mjs` per-attribute counts | ✅ |
| Published baseline comparison | `analysis.mjs` `publishedBaselines` | ✅ |
| GDPR compliance | `PRIVACY_AND_COMPLIANCE.md` | ✅ |
| Reproducible ML (Docker) | `automation/training/Dockerfile` | ✅ |
