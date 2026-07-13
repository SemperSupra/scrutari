# Three-Tier Detection Architecture: Implementation Strategy

## Baseline Stability Confirmed (Run 4)

| Test | Run 1 | Run 2 | Run 3 | Run 4 | Stable? |
|------|:-----:|:-----:|:-----:|:-----:|:-------:|
| Headless Chrome | 48% | 48% | 48% | 48% | ✅ |
| Chrome Windows | 44% | 44% | 44% | 44% | ✅ |
| Chrome mobile | 48% | 48% | 48% | 48% | ✅ |
| Firefox | 49% | 49% | 49% | 49% | ✅ |
| WebKit | 24% | 24% | 24% | 24% | ✅ |
| Bot behavioral | 64% | 64% | 68% | 68% | ✅ |
| Human behavioral | 6% | 6% | 12% | 12% | ✅ |

All 123 tests: 100%.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                  Browser SPA (Scrutari)                  │
│  ┌─────────────────────────────────────────────────────┐│
│  │  Tier 1: Heuristic Engine (36+26 signals)           ││
│  │  └─→ botScore (0-100) — deterministic, O(1)       ││
│  │                                                     ││
│  │  Tier 2: ML Model (ONNX Runtime Web)                ││
│  │  └─→ mlScore (0-1) — probabilistic, O(n)          ││
│  │                                                     ││
│  │  Tier 3: Anomaly Detector (Isolation Forest)        ││
│  │  └─→ anomalyScore — reference-based              ││
│  └─────────────────────────────────────────────────────┘
│                           │
│                    All data submitted
│                           ▼
└─────────────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────┐
│                  Server-Side Pipeline                    │
│  ┌─────────────────────────────────────────────────────┐│
│  │  Storage: deduplicated fingerprints + frequencies   ││
│  │  Analysis: /api/analysis dashboard                  ││
│  │  Model Training: Python (TensorFlow → ONNX)        ││
│  │  Comparison: per-submission scores from all tiers   ││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

---

## Tier 1: Heuristic Engine ✓ (DONE)

**Status:** ✅ Complete and deployed.
**Signals:** 36 static fingerprint + 26 behavioral = 95 maxWeight
**Output:** botScore (0-100) with confidence (High/Medium/Low)
**Tests:** 123 automated tests, 100% passing

### What runs where
- **Browser**: Full engine executes during behavioral recording
- **Server**: No server-side heuristic — computed client-side

### Versioning
- Bump `detectorVersion` when signals change
- Documented in DETECTOR_CHANGELOG.md

---

## Tier 2: ML Model (NEXT)

**Status:** 📝 Design phase.
**Goal:** Train a classifier that matches or exceeds heuristic accuracy.

### Phase 2.1: Data Pipeline

**Input data sources:**
1. **Our submissions** — labeled by `source` field (manual, automation_playwright)
2. **SapiMouse dataset** — 120 users, CSV, mouse (x,y,t) — pre-training
3. **DELBOT-Mouse** — labeled human/bot mouse sessions — fine-tuning
4. **BB-MAS** — 1.7M mobile swipes — mobile model

**Feature engineering** (extract from raw behavioral data):
```python
features = {
    'mouse_speed_mean': float,
    'mouse_speed_variance': float,
    'mouse_curvature': float,
    'velocity_profile_cv': float,
    'trajectory_optimality': float,
    'overshoot_frequency': float,
    'scroll_pause_rate': float,
    'scroll_direction_changes': int,
    'scroll_instant_jumps': int,
    'typing_speed_mean': float,
    'typing_speed_variance': float,
    'typing_corrections': int,
    'paste_events': int,
    'touch_events': int,
    'sensor_gravity_stability': float,
    'sensor_movement_variance': float,
    # + static fingerprint features
    'device_type': str,
    'browser': str,
    'engine': str,
    'gpu_class': str,
    'detector_version': int,
}
```

### Phase 2.2: Model Selection

| Model | Accuracy | Training Time | Inference | Interpretable |
|-------|:--------:|:-------------:|:---------:|:-------------:|
| **Random Forest** | 90-95% | Fast | Fast | ✅ Yes |
| **XGBoost** | 92-96% | Medium | Fast | 🟡 Partial |
| **1D CNN** | 93-97% | Medium | Medium | ❌ No |
| **LSTM** | 94-98% | Slow | Slow | ❌ No |
| **Transformer** | 95-99% | Very slow | Medium | ❌ No |

**Recommendation:** Start with Random Forest (baseline), then XGBoost. Only move to deep learning if needed.

### Phase 2.3: Deployment

```python
# Training script structure
# automation/train_model.py

# 1. Load labeled submissions from blob
# 2. Load SapiMouse + DELBOT-Mouse for pre-training
# 3. Extract features (same as heuristic engine)
# 4. Train Random Forest
# 5. Cross-validate against ground truth
# 6. Export to ONNX format
# 7. Deploy to Netlify blob for browser download
```

**Browser deployment path:**
```
Python model → ONNX → Netlify Blob → Browser downloads → ONNX Runtime Web
```

---

## Tier 3: Anomaly Detector (FUTURE)

**Status:** 📝 Research phase.
**Goal:** Detect novel attacks that neither heuristics nor ML have seen.

### Approach: Isolation Forest

Unsupervised anomaly detection — no labeled data needed.

```
Training: Build isolation forest from ALL submissions (bot + human)
Inference: Each submission gets anomaly score
           High anomaly = potentially novel attack
           Low anomaly = matches known patterns
```

### Implementation

```javascript
// Simplified anomaly score (client-side estimation)
function anomalyScore(behavioralFeatures, populationStats) {
  var zScores = 0;
  var count = 0;
  for (var key in behavioralFeatures) {
    if (populationStats[key]) {
      var mean = populationStats[key].mean;
      var std = populationStats[key].std;
      if (std > 0) {
        var z = Math.abs((behavioralFeatures[key] - mean) / std);
        zScores += z;
        count++;
      }
    }
  }
  return count > 0 ? zScores / count : 0;
}
```

**Population stats** are updated daily from all submissions. High z-scores indicate unusual behavior.

---

## Parallel Execution on Same Data

Every submission gets scored by ALL available tiers:

```javascript
// In the behavioral engine, after analysis:
var result = {
  heuristic: { score: botScore, confidence: confidence },
  ml: mlScore,                 // null if model not loaded yet
  anomaly: anomalyScore,       // null if population stats not available
  groundTruth: source,         // from submission source
  timestamp: Date.now(),
  detectorVersion: DETECTOR_VERSION,
};
```

This enables direct per-submission comparison across all methods.

### Comparison Dashboard

The `/api/analysis` endpoint will be extended to show:

```json
{
  "comparison": {
    "available": false,
    "note": "Need 100+ labeled submissions for meaningful comparison"
  },
  "heuristic": { "precision": null, "recall": null, "f1": null },
  "ml": { "precision": null, "recall": null, "f1": null, "status": "not trained" },
  "anomaly": { "status": "not implemented" }
}
```

---

## Implementation Roadmap

### Sprint 1 (Week 1): Data Pipeline
- [ ] Export behavioral data from submissions → CSV
- [ ] Download SapiMouse + DELBOT-Mouse datasets
- [ ] Build feature extraction script (Python)
- [ ] Create training/evaluation split

### Sprint 2 (Week 2): Model Training
- [ ] Train Random Forest baseline on SapiMouse data
- [ ] Evaluate against our ground truth labels
- [ ] Train XGBoost, compare accuracy
- [ ] Export to ONNX format

### Sprint 3 (Week 3): Browser Deployment
- [ ] Add ONNX Runtime Web dependency
- [ ] Load model from Netlify blob
- [ ] Run inference in parallel with heuristic
- [ ] Submit mlScore alongside heuristic score

### Sprint 4 (Week 4): Anomaly Detection
- [ ] Build population statistics from submissions
- [ ] Implement Isolation Forest (simplified client-side version)
- [ ] Add anomaly score to parallel analysis
- [ ] Update /api/analysis comparison dashboard

### Sprint 5 (Month 2): Validation & Publication
- [ ] Cross-validate all three tiers against ground truth
- [ ] Compare: does ML beat heuristics? Does ensemble beat either?
- [ ] Measure adaptation speed (retrain ML vs update rules)
- [ ] Pre-print results

---

## Key Metrics for Comparison

| Metric | Tier 1 (Heuristic) | Tier 2 (ML) | Tier 3 (Anomaly) |
|--------|:------------------:|:-----------:|:-----------------:|
| **Precision** | measures now | needs N≥100 | N/A |
| **Recall** | measures now | needs N≥100 | N/A |
| **F1** | measures now | needs N≥100 | N/A |
| **AUC-ROC** | needs labeled data | needs N≥100 | N/A |
| **Detection latency** | ~5s (recording) | ~5s + 100ms | ~5s |
| **Adaptation speed** | ~1 day (rule) | ~1 hour (retrain) | Instant (statistical) |
| **Novel attack detection** | Poor (new rules) | Poor (retrain) | Good (outlier) |
| **False positive rate** | ~6-12% (human sim) | Unknown | Higher |
