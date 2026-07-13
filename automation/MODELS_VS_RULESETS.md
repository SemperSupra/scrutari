# Comparison Framework: Dynamic ML Models vs Dynamic Rulesets

## Current Baseline Status

All scores are **stable across consecutive runs**:

| Test | Score | Notes |
|------|:-----:|-------|
| Headless Chrome | 48% | Stable |
| Chrome Windows | 44% | Stable |
| Chrome mobile | 48% | Stable |
| Firefox | 49% | Stable |
| WebKit | 24% | Stable |
| **Bot behavioral** | **68%** | Stable (minor variance from randomization) |
| **Human behavioral** | **12%** | Stable (minor variance) |

---

## 1. The Comparison Framework

### Architecture: Parallel Execution

```
Browser Session
      │
      ├──→ 1. Heuristic Engine (current)
      │       36 signals × fixed weights
      │       Output: botScore (0-100)
      │       Execution: O(1), deterministic
      │
      ├──→ 2. ML Model (planned)
      │       Trained classifier (RF/ONNX)
      │       Output: botProbability (0-1)
      │       Execution: O(n), probabilistic
      │
      └──→ 3. Anomaly Detector (future)
              Unsupervised (Isolation Forest)
              Output: anomalyScore (0-∞)
              Execution: O(n), reference-based
```

### Comparison Metrics

| Metric | What it measures | Heuristic (current) | ML (planned) | Anomaly (future) |
|--------|------------------|:-------------------:|:-------------:|:----------------:|
| **Precision** | TP / (TP + FP) | ✅ Computable | ✅ | N/A |
| **Recall** | TP / (TP + FN) | ✅ Computable | ✅ | N/A |
| **F1** | Harmonic mean | ✅ Computable | ✅ | N/A |
| **AUC-ROC** | Threshold-independent | ✅ | ✅ | N/A |
| **Detection latency** | Time to classify | O(1) instant | O(n) ms | O(n) ms |
| **Adaptation speed** | New evasion → detection | Days (hand-craft rule) | Hours (retrain) | Immediate (anomaly) |
| **Explainability** | Why this result? | ✅ Each signal explainable | ❌ Black box | 🟡 Feature importance |
| **Adversarial robustness** | Evasion difficulty | Medium (threshold learning) | Medium (adversarial ex.) | High (unknown reference) |
| **Data efficiency** | Samples needed to start | Zero (expert knowledge) | ~1000+ | ~100+ |

### Key Research Question

> **"In a longitudinal arms race, which approach adapts faster to new evasion techniques?"**

Hypothesis: Rulesets are more robust initially but require manual updates. ML models adapt faster via retraining but have surprising failure modes. Anomaly detection is most robust against novel attacks but has higher false positive rates.

---

## 2. Dynamic Ruleset Versioning (Our Current System)

**What changes between versions:**
- New signal added (e.g., paste detection in v2)
- Signal weight adjusted (e.g., velocity profile from w0 to w4)
- Threshold changed (e.g., curvature threshold from 0.8 to 0.7)
- New test category added (e.g., Phase 2 AI signals)

**Version history:**
```
v1 (baseline):   36 signals, 82 maxWeight → human sim 28% bot
v1.5 (behavior): Behavioral engine added → human sim 10% bot
v2 (AI signals): +5 signals, 95 maxWeight → human sim 6% bot
v2.1 (mobile):   Touch + sensor tracking added → human sim ~12% bot
```

### Dynamic Model Versioning (Planned)

**What changes between versions:**
- New training data added
- Model architecture changed (RF → LSTM → Transformer)
- Feature set changed

**Comparison approach:**
```
For each ground-truth-labeled submission:
  score_heuristic_v2 = computeHeuristic(fingerprint)
  score_ml_v1 = modelV1.predict(features)
  score_ml_v2 = modelV2.predict(features)
  
  Log: {submission_id, heuristic_v2, ml_v1, ml_v2, ground_truth}
```

This enables head-to-head comparison across versions and approaches.

---

## 3. Other Methods to Consider

### 3.1 Anomaly Detection (Unsupervised)

**How it works:** Build a profile of "normal" human behavior from all submissions. Flag anything outside the normal distribution as anomalous (potentially bot).

**Advantages:**
- No labeled data needed (uses all submissions as "normal")
- Detects NOVEL attacks (not just known patterns)
- Adapts automatically as more data arrives

**Disadvantages:**
- Contamination problem (bot submissions in training data)
- Higher false positive rate
- Hard to explain why something is anomalous

**Implementation:**
```javascript
// Isolation Forest approach — flag outliers
function anomalyScore(features, referenceDistribution) {
  // How many standard deviations from the mean?
  var deviations = 0;
  for (var attr in features) {
    if (referenceDistribution[attr]) {
      var z = (features[attr] - referenceDistribution[attr].mean) 
            / referenceDistribution[attr].std;
      deviations += Math.abs(z);
    }
  }
  return deviations; // Higher = more anomalous
}
```

### 3.2 Bayesian Updating

**How it works:** Start with a prior belief (50% bot). Update belief as each signal is observed. Final probability = posterior.

**Advantages:**
- Naturally handles uncertainty
- Can incorporate expert knowledge as priors
- Provides confidence intervals, not just point estimates

**Disadvantages:**
- Requires conditional probabilities per signal
- Assumes conditional independence (naive Bayes)

### 3.3 Ensemble Methods (Stacking)

**How it works:** Combine multiple weak detectors into a strong detector. Each detector votes, weighted by its historical accuracy.

**Advantages:**
- More robust than any single method
- Naturally handles detector addition/removal
- Each detector can specialize in different attack types

**Disadvantages:**
- More complex to maintain
- Requires validation set to compute weights

### 3.4 Behavioral Profiling (Cross-Session)

**How it works:** Build a profile of a user/browser across multiple visits. Compare current behavior to historical profile.

**Advantages:**
- Detects session hijacking (same fingerprint, different behavior)
- Enables continuous authentication
- Very hard for bots to fake (need to maintain consistent behavior across sessions)

**Disadvantages:**
- Requires returning users (slower to collect)
- Privacy implications of tracking across sessions
- Template aging (behavior changes over time)

### 3.5 Graph-Based Analysis

**How it works:** Build a graph connecting devices, IPs, accounts, and behavioral patterns. Detect bot networks via graph anomalies.

**Advantages:**
- Detects coordinated bot attacks
- Can identify bot farms even if individual bots look human
- Used commercially by GeeTest, DataDome

**Disadvantages:**
- Requires network-level data (IPs, timing)
- Not feasible from a browser-only SPA
- Privacy implications

### 3.6 Challenge-Response (CAPTCHA / PoW)

**How it works:** When uncertainty is high, issue a challenge:
- Proof of Work (SHA-256 hash) — costs computation
- CAPTCHA — costs human time
- Turnstile (Cloudflare) — invisible verification

**Advantages:**
- Gold standard for final verification
- Well-understood methodology
- Cloudflare Turnstile is free and invisible

**Disadvantages:**
- Increases user friction (PoW/CAPTCHA)
- Bots are getting better at solving CAPTCHAs
- PoW is unfair on mobile (battery cost)

---

## 4. Recommendation: Three-Tier Detection

```
Tier 1: Heuristic (instant, O(1))
    └─→ Score < 20% → Human (pass through)
    └─→ Score 20-60% → Uncertain → Check Tier 2
    └─→ Score > 60% → Bot (block/challenge)

Tier 2: ML Model (fast, O(n))
    └─→ Score < 30% → Human
    └─→ Score > 70% → Bot
    └─→ Score 30-70% → Uncertain → Check Tier 3

Tier 3: Challenge-Response (slow, interactive)
    └─→ PoW or CAPTCHA
    └─→ Verify human/automated definitively
```

This tiered approach:
- Uses heuristics for speed (most traffic)
- Uses ML for accuracy (ambiguous cases)
- Uses challenges for definitive verification (edge cases)
- Each tier is independently versioned and comparable

---

## 5. Implementation Roadmap

| Phase | What | When |
|:-----:|------|:----:|
| v2.1 | ✅ Heuristic engine complete | Now |
| v2.2 | Train Random Forest on SapiMouse + our data | Month 1 |
| v2.3 | Implement Bayesian anomaly detection | Month 1 |
| v2.4 | Deploy ONNX model via LiteRT.js | Month 2 |
| v2.5 | Cross-version comparison dashboard | Month 2 |
| v3 | Three-tier system with PoW challenge | Month 3 |
