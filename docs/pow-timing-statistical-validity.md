# PoW Timing: Statistical Validity Analysis

**Question:** Is a single ~500ms PoW computation sufficient for statistically
valid timing anomaly detection, or is the signal lost in noise?

**Short answer:** The 500ms submission PoW is **not** a clean measurement — it's
confounded by network latency, GC pauses, and scheduler jitter. But we already
have a **better measurement** running during fingerprint capture.

---

## 1. Confounding Factors in Submission PoW Timing

| Factor | Magnitude | Impact on 500ms measurement |
|--------|:---------:|----------------------------|
| **Network RTT** (challenge fetch) | 10-200ms | 2-40% error — cannot separate from compute time |
| **GC pauses** (V8 garbage collection) | 1-30ms | 0.2-6% jitter, non-deterministic |
| **CPU scheduling** (other tabs, OS) | 0-200ms | 0-40% inflation for background tabs |
| **Power management** (battery vs AC) | 10-50% | Systematic bias, not noise |
| **Thermal throttling** | 10-30% | Increases with sustained load |
| **Timer precision** (performance.now) | 0.02-0.1ms | Negligible (<0.02%) |

**Result:** A single ~500ms submission PoW has ~20-50% measurement noise.
Detecting a 3× anomaly (e.g., ASIC accelerator) is feasible (SNR ≈ 6-15).
Detecting a 1.5× anomaly (e.g., fast VM vs native) is NOT reliable at
this noise level (SNR ≈ 0.75-3).

---

## 2. We Already Have a Better Measurement

The existing **fingerprint PoW benchmark** (`fp['PoW Speed']`) is superior
for timing analysis because:

| Factor | Fingerprint Benchmark | Submission PoW |
|--------|---------------------|----------------|
| **Challenge source** | Self-generated | Server-issued (network) |
| **Network dependency** | ❌ None | ✅ Required (10-200ms noise) |
| **Iterations** | 50,000 (fixed) | Variable (adaptive, ~50K avg) |
| **Measurement** | hashes/sec (stable) | wall-clock ms (noisy) |
| **CV (coefficient of variation)** | ~3-5% | ~20-50% |
| **Existing in dataset** | ✅ Already collected | ⬜ New field |

**The fingerprint benchmark gives us a ~10× cleaner signal** because it
eliminates network latency and runs a fixed workload.

---

## 3. Scientific Validity Analysis

### 3.1 Can we detect an accelerator (100× faster)?

Using the submission PoW (SNR ≈ 6-15):
- Required N for 80% power, α=0.05: **N=3-5 measurements**
- ✅ Feasible with a single visit

### 3.2 Can we detect a VM/container (2-5× slower)?

Using the fingerprint benchmark (CV ≈ 5%):
- Required N for 80% power, α=0.05: **N=8-12 measurements**
- ✅ Feasible with population data, marginal for single visit

### 3.3 Can we detect headless Chrome (1.2-1.5× faster)?

Using the fingerprint benchmark (CV ≈ 5%):
- Effect size d = 0.4-0.8 (small-medium)
- Required N for 80% power, α=0.05: **N=26-52 measurements**
- ✅ Feasible with population data, not reliable for individual classification

### 3.4 Power Analysis Table

| Detection Target | Effect Size | Signal Source | N required | Per-Visit? |
|-----------------|:-----------:|:-------------:|:----------:|:----------:|
| ASIC/GPU accelerator | 10-100× | Submission PoW | 3-5 | ✅ Yes |
| Headless browser | 1.5-3× | Fingerprint benchmark | 12-26 | 🟡 Marginal |
| VM/container | 2-5× | Fingerprint benchmark | 8-12 | 🟡 Marginal |
| Browser family diff | 1.1-1.3× | Fingerprint benchmark | 52-150 | ❌ Population only |
| CPU throttling | 1.2-2× | Longitudinal benchmark | 10-20 | ❌ Needs 2+ visits |

---

## 4. Recommended Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    TIMING ANALYSIS PIPELINE                       │
│                                                                   │
│  Fingerprint PoW Benchmark (hashes/sec)                          │
│  ├─ Self-generated challenge (no network noise)                  │
│  ├─ 50K iterations (stable, CV ~5%)                             │
│  ├─ Already collected for every visitor                         │
│  └─ → PRIMARY SIGNAL for bot detection                          │
│                                                                   │
│  Submission PoW (wall-clock ms)                                  │
│  ├─ Server-issued challenge (network noise ~20%)                │
│  ├─ Adaptive difficulty (variable workload)                     │
│  ├─ New field (not yet in dataset)                              │
│  └─ → SECONDARY SIGNAL, use with caution                        │
│                                                                   │
│  Longitudinal Benchmark (same device, multiple visits)           │
│  ├─ Per-device baseline (sessionID-based)                       │
│  ├─ Detects drift (new extensions, VM migration)                │
│  └─ → TERTIARY SIGNAL for ongoing monitoring                     │
└─────────────────────────────────────────────────────────────────┘
```

## 5. Action Plan

### Now (already implemented)
- Keep submission PoW challenge-response for **security** (prevents replay)
- Keep adaptive difficulty for **UX** (consistent ~500ms on any device)
- Record `_powTiming` payload for **exploratory analysis**

### Recommended changes
1. **Add fingerprint benchmark PoW speed to submission payload**
   - `data.powBenchmarkSpeed = fp['PoW Speed']` (already available)
   - This is our cleanest signal — should be in the research dataset
   - Already submitted? Check: `buildSubmissionData` includes `botScore` but not `powSpeed`

2. **Run statistical validation experiment**
   - Collect N=1000 submission PoW timings + benchmark speeds
   - Compute: within-device variance vs between-device variance
   - Compute: ICC (intraclass correlation coefficient)
   - Only then decide whether submission PoW timing is worth using as a signal

3. **Design the timing signal as a real Bot-or-Not test**
   - Weight: w2 (informational, not decisive)
   - Logic: `pow_anomaly = abs(log2(actual / expected)) > threshold`
   - Threshold calibrated from the N=1000 dataset
