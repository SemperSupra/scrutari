# Advanced Features: ML Models, LiteRT.js & Enterprise Detection

## 1. LiteRT.js for Bot Recognition

### What It Is
Google's LiteRT.js (npm: `@litertjs/core`) runs TensorFlow Lite models in-browser via:
- **CPU**: WebAssembly via XNNPACK (Google's optimized CPU runtime)
- **GPU**: WebGPU via ML Drift
- **NPU**: WebNN (experimental, Chrome flag)

Performance claims: 3× faster than TensorFlow.js, 5-60× with WebGPU.

### Can We Use It for Bot Detection?

**Yes, but with caveats:**

| Approach | Feasibility | Why |
|----------|:-----------:|-----|
| **Real-time mouse movement classification** | ✅ Feasible | Model takes raw (x,y,t) sequences → outputs humanness score |
| **Replacing heuristic signals with ML** | ✅ Feasible | Train model to classify behavior holistically instead of per-signal heuristics |
| **PoW via model inference** | 🟡 Possible | Browser runs model inference as proof of computation (harder for bots than SHA-256) |
| **Full PoW replacement** | ❌ Overkill | LiteRT.js model loading takes 40-60s on first page load (too slow for PoW) |

### How We'd Use It

```
Raw mouse data ──→ Feature extraction ──→ LiteRT.js model ──→ Humanness score
(x, y, timestamps)   (velocity, accel,    (.tflite model)      (0-100%)
                      curvature, etc.)                          
```

**Training pipeline:**
1. Collect mouse movement data from our SPA (already doing this)
2. Label as `human` or `bot` (from our ground truth sources)
3. Train a model using TensorFlow/Keras (Python)
4. Convert to `.tflite` format
5. Deploy with LiteRT.js in the SPA
6. Model runs 100% client-side — no data leaves browser

### Why This Would Help

Our current approach uses **hand-crafted heuristics** (velocity CV, optimality ratio, etc.). These work but:
- They're threshold-based (a bot that learns the thresholds can evade)
- They don't capture complex patterns an ML model would find
- Each new evasion technique requires a new hand-crafted rule

An ML model would:
- **Find patterns we can't express as simple heuristics**
- **Generalize to unseen evasion techniques**
- **Adapt via retraining** without rewriting rules

### Caution from Research

**BeCAPTCHA-Mouse (Acien et al., 2022)** found that one-class SVM trained only on real samples failed to detect most attacks (error rates >34%). This means **synthetic training data is essential** — we need both human AND bot samples for training.

**LiteRT.js WebGPU limitations**: Developer reports show WebGPU backend fails on some model architectures (6D tensors unsupported). CPU (XNNPACK) is reliable but slower.

---

## 2. ML-Enhanced Behavioral Engine

### Proposed Architecture

```
             ┌─────────────────────────────┐
             │  Current Heuristic Engine    │
             │  (36 signals, 95 max weight) │ ← Kept for interpretability
             └─────────────────────────────┘
                           +
             ┌─────────────────────────────┐
             │  LiteRT.js ML Model          │
             │  (on-device inference)       │ ← New ML layer
             └─────────────────────────────┘
                           │
                           ▼
             ┌─────────────────────────────┐
             │  Combined Bot-or-Not Score   │
             │  (heuristic + ML ensemble)  │
             └─────────────────────────────┘
```

### Model Design (First Pass)

- **Input**: Sequence of 50 mouse events (x, y, t) + scroll events + click events
- **Architecture**: 1D CNN + LSTM (captures spatial + temporal patterns)
- **Output**: Binary classification (human/bot) + confidence score
- **Size target**: < 1MB (for fast browser loading)
- **Framework**: TensorFlow → TFLite → LiteRT.js

### Training Data

| Source | Label | Expected Volume |
|--------|-------|:---------------:|
| Human simulation (Playwright) | Bot | ~100 sessions/week |
| Bot simulation (Playwright default) | Bot | ~100 sessions/week |
| Manual submissions (real users) | Human | ~1-5 sessions/day |
| Honeypot captures (crawlers) | Bot | Variable |
| **Total needed** | | **~1000+ labeled sessions** |

---

## 3. LiteRT.js as Proof of Work

### Current PoW (Already Built)
Our SPA already has a SHA-256 PoW benchmark as part of fingerprint capture:
```javascript
// Mine for a nonce with leading zero bits
for (nonce = 0; nonce < maxAttempts; nonce++) {
  var hashBuffer = await crypto.subtle.digest('SHA-256', ...);
  // Check leading zero bits
}
```

### ML-Based PoW (New Idea)
Instead of SHA-256 hashing, require the browser to run a LiteRT.js model inference:

```
Challenge: "classify this mouse movement sequence as human or bot"
Proof: model output + timing measurement
```

**Why this is harder for bots:**
- Bots would need to run the SAME model to generate the expected output
- If the model requires real human input, bots can't fake it
- Model inference on WebGPU is hardware-specific (can't be GPU-farmed as easily)

**Why this is risky:**
- Model loading time (40-60s) makes the PoW impractical for real users
- Model inference time varies by device (unfair to mobile users)
- If model output is deterministic, bots can precompute it

**Recommendation**: Keep the existing SHA-256 PoW (it's simple, predictable, and already works). Don't use LiteRT.js for PoW.

---

## 4. Alternative ML Frameworks

| Framework | Model Format | GPU Support | Maturity | Best For |
|-----------|-------------|:-----------:|:--------:|----------|
| **LiteRT.js** | .tflite | ✅ WebGPU | New (2026) | Mobile-web synergy, performance |
| **ONNX Runtime Web** | .onnx | ✅ WebGPU | Mature | Cross-platform, stability |
| **TensorFlow.js** | TFJS / SavedModel | ✅ WebGL | Very mature | Training + inference |
| **Transformers.js** | ONNX (via ORT) | ✅ WebGPU | Mature | NLP, vision transformers |
| **WebNN API** | Native | ❌ (NPU) | Experimental | Future-proofing |

### Recommendation

**ONNX Runtime Web** is the most pragmatic choice for 2026:
- More mature WebGPU support than LiteRT.js
- Doesn't fail on model architectures LiteRT.js can't handle
- Supports ONNX format (interoperable with PyTorch, TensorFlow)
- Used by Hugging Face's Transformers.js

Use LiteRT.js only if:
- Your model has simple ops (no 6D+ tensors)
- You want the same .tflite format on mobile and web
- You can tolerate 40-60s initial load times

---

## 5. Detecting Enterprise Protection Frameworks (Menlo, Zscaler, Netskope)

### What These Systems Do
Enterprise browser isolation/protection systems like **Menlo Security**, **Zscaler Internet Access**, and **Netskope** act as proxies or remote browser isolation (RBI) layers between the user and websites. For bot detection, they're relevant because:
- They may alter browser fingerprints (adding/removing signals)
- A user behind these systems may appear bot-like due to the proxy
- Alternatively, detecting these systems helps us understand our user population

### What We Can Detect from Browser JS

| Signal | What to check | Indicates |
|--------|---------------|:---------:|
| **TLS fingerprint mismatch** | `performance.getEntries()` for unusual TLS | Enterprise proxy |
| **SSL certificate inspection** | `window.crypto.subtle.exportKey()` for proxy certs | MITM proxy |
| **Extra injected DOM elements** | `document.querySelector('.menlo-*')` or similar | Menlo-specific |
| **Unusual `navigator.connection`** | Missing RTT/downlink when normally present | RBI system |
| **`navigator.hardwareConcurrency`** | Very low (2) or very precise (4, 8) | Virtualized browser |
| **`navigator.deviceMemory`** | Low values (2, 4) | Thin client/RBI |
| **Screen resolution** | Cloud-browser resolutions (1280x720, 1920x1080 only) | Standardized RBI |
| **Color depth** | Exactly 24-bit (no HDR) | Legacy RBI |
| **Plugin count** | 0 plugins | Stripped browser |
| **User-Agent + platform mismatch** | UA says macOS but platform reports Win32 | Spoofed |
| **Timing anomalies** | High latency to first interaction | Remote rendering |
| **`performance.timeOrigin`** | Unusual epoch offset | Container cold start |
| **WebGL renderer** | Software renderers (llvmpipe, SwiftShader) | Virtual GPU |
| **Font enumeration** | Minimal fonts (fewer than expected for claimed OS) | Stripped OS |
| **`window.chrome` presence** | Present in non-Chrome browsers | Spoofed UA |

### Implementation Strategy

```javascript
function detectEnterpriseProtection() {
  var signals = [];
  // Check for injected DOM elements from known RBI vendors
  var rbiMarkers = ['.menlo-', '#menlo-', '[data-menlo]', '.zscaler-', '.netskope-'];
  for (var i = 0; i < rbiMarkers.length; i++) {
    try { if (document.querySelector(rbiMarkers[i])) signals.push('RBI injected'); } catch(e) {}
  }
  // Check for unusual hardware specs
  var cores = navigator.hardwareConcurrency || 0;
  var mem = navigator.deviceMemory || 0;
  if (cores <= 2 && mem > 0) signals.push('Low hardware (possible RBI)');
  if (cores >= 16 && mem >= 8) signals.push('High hardware (possible server)');
  // Check for software WebGL
  var canvas = document.createElement('canvas');
  var gl = canvas.getContext('webgl');
  if (gl) {
    var info = gl.getExtension('WEBGL_debug_renderer_info');
    if (info) {
      var renderer = gl.getParameter(info.UNMASKED_RENDERER_WEBGL) || '';
      if (renderer.includes('llvmpipe') || renderer.includes('swiftshader'))
        signals.push('Software GPU (possible RBI/VM)');
    }
  }
  return signals;
}
```

### Limitation: Stealthy RBI Systems

Sophisticated RBI systems (like Menlo's newer versions) are designed to be **undetectable** — they carefully patch all detectable signals. We may only detect:
- Older versions with incomplete patching
- Systems with performance-impacting configurations
- Specific vendor markers left in the DOM

### Research Value

Even partial detection is valuable for our dataset:
- Tag submissions from RBI systems with a `protectionFramework` field
- Track how their fingerprints differ from organic users
- Publish findings on RBI fingerprint characteristics (novel research contribution)

---

## 6. Implementation Roadmap

| Phase | Item | Framework | Effort |
|:-----:|------|-----------|:------:|
| v3.1 | Add enterprise protection detection | Custom JS | 2 days |
| v3.2 | Export mouse data for ML training | Python script | 1 day |
| v3.3 | Train classification model | TensorFlow + Keras | 1 week |
| v3.4 | Deploy model via ONNX Runtime Web | ONNX Runtime Web | 3 days |
| v3.5 | Ensemble heuristic + ML scores | Custom JS | 2 days |
| v3.6 | Evaluate accuracy vs ground truth | Python analysis | 2 days |

### Recommendation

**Start with v3.1 (enterprise detection)** — it's quick, adds valuable metadata to submissions.
**Then v3.2-v3.3 (ML training)** — collect sufficient labeled data first (need ~1000+ sessions).
**Defer v3.4-v3.6** until we have enough training data and LiteRT.js/ONNX Runtime Web mature further.
