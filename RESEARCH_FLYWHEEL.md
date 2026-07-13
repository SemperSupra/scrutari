# Research Flywheel

## The Cycle

```
                    ┌─────────────────────────────────┐
                    │         DATA COLLECTION          │
                    │  SPA submissions + honeypot +    │
                    │  automation baselines            │
                    └──────────────┬──────────────────┘
                                   │
                                   ▼
                    ┌─────────────────────────────────┐
                    │         ANALYSIS                 │
                    │  /api/analysis dashboard         │
                    │  Per-signal entropy, confusion   │
                    │  matrix, precision/recall/F1     │
                    └──────────────┬──────────────────┘
                                   │
                                   ▼
                    ┌─────────────────────────────────┐
                    │      GAP IDENTIFICATION          │
                    │  Literature review comparisons   │
                    │  Adversarial testing (baselines) │
                    │  Signal half-life tracking       │
                    └──────────────┬──────────────────┘
                                   │
                                   ▼
                    ┌─────────────────────────────────┐
                    │      IMPLEMENTATION              │
                    │  New signals (paste, velocity)   │
                    │  New tests (state machine, HP)   │
                    │  Detector version bump           │
                    └──────────────┬──────────────────┘
                                   │
                                   └──→ Back to Data Collection
```

## Current Iteration (v1)

| Phase | Status | What |
|-------|:------:|------|
| Data Collection | ✅ | SPA + honeypot + baselines all submitting |
| Analysis | ✅ | /api/analysis computes entropy, confusion matrix |
| Gap Identification | ✅ | Literature review identifies 5 critical gaps |
| Implementation | 🔄 **Here** | Phase 1: paste detection + velocity profile |

## Priority Queue (v1 → v2)

| # | Gap | Detector version | Effort | Impact |
|:-:|-----|:----------------:|:------:|:------:|
| 1 | Paste detection | v2 | 2 hrs | Catches ChatGPT Agent, Atlas, Comet |
| 2 | Velocity profile analysis | v2 | 4 hrs | BeCAPTCHA-validated (93% accuracy) |
| 3 | Trajectory optimality | v2 | 4 hrs | Catches optimal-path agents |
| 4 | Overshoot frequency | v2 | 2 hrs | Humans correct; bots don't |
| 5 | Scroll pattern classification | v2 | 3 hrs | Discrete vs continuous scroll |
| 6 | Inter-event interval distribution | v3 | 6 hrs | 96% F1 agent identification |
| 7 | CDP Runtime detection | v3 | 4 hrs | Vastel 2024 technique |
| 8 | Approximate Entropy micro-movement | v3 | 8 hrs | 98.52% AUC (Wang 2025) |
| 9 | Open-set anomaly detection | v4 | 2 days | Unknown agent types |
| 10 | Cross-reference agent benchmarks | v4 | 1 day | Publication-ready comparison |
