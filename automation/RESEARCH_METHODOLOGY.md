# Scrutari Research Methodology

## Study Design
**Longitudinal observational study** of browser fingerprint signal effectiveness for bot/human classification.

### Research Questions
1. **Signal effectiveness**: Which browser signals best distinguish automated browsers from human users?
2. **Signal half-life**: How long does each detection signal remain effective before bots adapt?
3. **Drift detection**: When and how do detection rates change over time?
4. **Methodology comparison**: How does Scrutari's detection compare to established tools (EFF Cover Your Tracks, BrowserLeaks)?

### Hypotheses
- H1: Behavioral signals (mouse movement, typing patterns) have longer effective lifespans than static signals (navigator.webdriver)
- H2: Combined static + behavioral detection outperforms either alone
- H3: Honeypot/trap signals (hidden fields, decoy buttons) are the most robust against evasion
- H4: Fingerprint entropy correlates positively with bot-likeness (headless browsers have less varied fingerprints)

---

## Data Collection

### Submission Schema
Every submission contains:
- `detectorVersion`: Which version of the algorithm generated the score
- `source`: Ground truth label (`manual`, `automation_playwright`, etc.)
- `botScore`: Computed Bot-or-Not score (0-100)
- `screenClass`, `gpuClass`, `engine`, etc.: Bucketed fingerprint attributes
- `selfAssessment`: User's self-rating (1-5, optional)
- `submitted`: Date of submission (anonymized)

### Storage
Netlify Blob Storage with deduplication:
- **Unique fingerprints** stored once with frequency counters
- **Marginal distributions** pre-computed per attribute
- **firstSeen/lastSeen** timestamps per fingerprint

### Known Biases
| Bias | Impact | Mitigation |
|------|--------|------------|
| Self-selection bias | Only privacy-conscious users submit | Document in methodology; weight by source |
| Automation contamination | Bot submissions without ground truth labels | Label known bots via `source` field |
| Sample independence | Same user may submit multiple times | Dedup with frequency counters tracks duplicates |
| Temporal bias | More submissions from certain timezones | Date-only timestamps, aggregate by week |
| Tool bias | Playwright is our primary automation baseline | Expand to Selenium, Puppeteer, stealth variants |
| Survivor bias | Only returning visitors are tracked longitudinally | Track first-seen vs last-seen per fingerprint |

---

## Statistical Framework

### Minimum Sample Sizes
| Analysis | Min N | Ideal N | Current Status |
|----------|:-----:|:-------:|:--------------:|
| Per-signal effectiveness (t-test) | 30 bots + 30 humans | 100+ each | ❌ Too few |
| ROC curve (per signal) | 50+ total | 200+ | ❌ Too few |
| Longitudinal drift detection | 3+ measurement points | 12+ monthly | ❌ Not started |
| Confusion matrix (overall) | 100+ labeled | 1000+ labeled | ❌ Too few |
| Signal half-life estimation | 6+ months data | 2+ years | ❌ Not started |

### Statistical Tests
| Test | Purpose | When |
|------|---------|------|
| Mann-Whitney U | Compare bot vs human score distributions | Per signal, per detector version |
| Cohen's d | Effect size (how well does each signal separate) | Per signal |
| Youden's J | Optimal threshold for each signal | Per signal ROC |
| McNemar's test | Compare paired proportions (v1 vs v2 detector) | Across detector versions |
| Change-point detection | When did a signal's effectiveness change? | Longitudinal analysis |
| Benjamini-Hochberg | FDR correction for multiple comparisons | When testing many signals |

### Outcome Measures
- **Precision**: Of things we called bot, how many were actually bot? TP / (TP + FP)
- **Recall**: Of actual bots, how many did we catch? TP / (TP + FN)
- **F1 Score**: Harmonic mean of precision and recall
- **AUC-ROC**: Area under receiver operating characteristic curve
- **Signal half-life**: Time for signal's AUC to drop by 50%
- **Detection latency**: Time between bot variant release and detection adaptation

---

## Ground Truth

### Labeled Sources
| Source | Type | How verified |
|--------|------|--------------|
| `manual` | Human | Self-reported via browser |
| `automation_playwright` | Bot | Our Playwright test suite |
| `automation_puppeteer` | Bot | Planned Puppeteer baseline |
| `automation_selenium` | Bot | Planned Selenium baseline |
| `automation_curl` | Bot | No JS execution = 100% bot |
| `honeypot` | Bot | Captured via crawler trap paths |
| `honeypot_js` | Likely bot | Captured via stealth JS in honeypot pages |

### Validation
- Ground truth is only as reliable as the source label
- `manual` submissions may be bots if the user lies
- Automation baselines are verified by running them ourselves
- Honeypot captures are classified by User-Agent heuristics (not definitive)

---

## Longitudinal Analysis

### Measurement Windows
- **Daily**: Raw submission counts, signal detection rates
- **Weekly**: Smoothed signal effectiveness, drift detection
- **Monthly**: Sample size accumulation, publication-ready aggregates

### Version Change Protocol
1. When detectorVersion changes, document ALL changes in DETECTOR_CHANGELOG.md
2. Old submissions are NEVER re-scored with new detector (would introduce bias)
3. Analysis compares old-version scores vs new-version scores separately
4. McNemar's test determines if the new version significantly differs

### Signal Half-Life Estimation
1. For each signal, compute monthly AUC-ROC
2. Fit exponential decay model: AUC(t) = AUC₀ × exp(-λt)
3. Half-life = ln(2) / λ
4. Compare half-lives across signal categories (static vs behavioral vs honeypot)

---

## Threats to Validity

### Internal Validity
- **Maturation**: Browsers and automation tools change over time independently of our study
- **Instrumentation**: Our detector changes between versions (mitigated by version tracking)
- **Selection**: Self-selected sample is not representative
- **Attrition**: Bots that get detected may stop visiting (survivor bias)

### External Validity
- **Population**: Only users who find Scrutari (English-speaking, tech-savvy)
- **Setting**: Lab condition vs real-world (users know they're being tested)
- **Temporal**: Results may not generalize to future browser/automation versions

### Construct Validity
- **Bot definition**: We classify based on our signals, then validate against ground truth
- **Circularity**: The same signals used for detection shouldn't be used for validation
- **Countermeasure**: Hold out 20% of ground truth data for final validation only

### Statistical Conclusion Validity
- **Multiple comparisons**: Testing 36+ signals inflates Type I error
- **Mitigation**: Benjamini-Hochberg FDR correction, α = 0.05
- **Power analysis**: Minimum 100 labeled submissions for meaningful results

---

## Implementation Status

### ✅ Built
- Detector version tracking in submission data
- Ground truth source labels
- Deduplication with frequency counters
- Marginal distribution computation
- Behavioral analysis engine (26 signals)
- Static fingerprint signals (36 signals)
- Self-assessment collection
- Honeypot/tarpit capture system
- Cross-reference comparison tool

### 🚧 In Progress
- Statistical analysis dashboard
- Per-signal effectiveness tracking

### ❌ Not Yet Built
- Confusion matrix computation
- ROC curve generation
- Longitudinal change-point detection
- Data freeze/export for academic use
- Automated bias detection
- Pre-registered protocol document
- Power analysis calculation
