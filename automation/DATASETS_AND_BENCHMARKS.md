# Public Browser Fingerprint Datasets & Benchmarks

## Available Open Datasets

| Dataset | Year | N | Uniqueness | Population | Access |
|---------|:----:|:----:|:----------:|------------|:------:|
| **Panopticlick** (Eckersley) | 2010 | 470K | 83% | Global, privacy-aware | Not released |
| **AmIUnique** (Laperdrix) | 2017 | 119K | 89% | Global, privacy-aware | Not released |
| **Hiding in Crowd** (Gómez-Boix) | 2018 | 2M | 33.6% | French, general | Not released |
| **Andriamilanto et al.** | 2020 | 4.1M | 88.4% | French mixed | Not released |
| **Berke et al. (Google)** | 2025 | 8,400 | N/A | US, demographically sampled | ✅ **Open access** |
| **FP-Rainbow** (Huyghe) | 2025 | 12.3GB | N/A | Chromium configs | ✅ **Zenodo** |
| **XFP-Recognizer** | 2025 | Top-10K crawl | N/A | Alexa sites | ✅ **Open access** |
| **BB-MAS** (swipe) | 2025 | 1.7M swipes | 99.7% | Mobile touch | ✅ **GitHub** |

### Key Findings Across Datasets

| Comparison | Finding |
|------------|---------|
| Privacy-aware vs general population | 89% vs 34% uniqueness (3× difference) |
| Desktop vs mobile | 89% vs 18.5% uniqueness (mobile far less unique) |
| Single-country vs global | French sample: 34% unique; global: 83-89% |
| Plugin deprecation | Uniqueness dropped as Flash/Java were removed from browsers |
| Demographic inference | Income, education, age can be inferred from browser attributes (Berke 2025) |

## How We Compare

### Baseline Distributions from Literature

| Attribute | Panopticlick (2010) | AmIUnique (2017) | Our Data (2026) |
|-----------|:-------------------:|:-----------------:|:----------------:|
| User-Agent | 10.0 bits | ~8.5 bits | TBD |
| Screen res | 4.8 bits | ~4.2 bits | TBD |
| Timezone | 3.0 bits | ~2.5 bits | TBD |
| Fonts | 13.9 bits | ~8.0 bits | TBD |
| Plugins | 15.4 bits | ~0 (deprecated) | 0 bits |
| **Total entropy** | **18.1 bits** | **~15 bits** | **TBD** |

### Validation Approach

1. **Compute per-attribute entropy** from our data using the same methodology as Eckersley (2010)
2. **Compare distributions** to published results
3. **If our entropies are LOWER** than published values → our sample has less diversity (expected for early-stage small sample)
4. **If our entropies are HIGHER** → our sample is more diverse (would suggest broader population reach)
5. **Document the comparison** in any publication

### Berke et al. (2025) Dataset — Most Useful for Us

This is the best comparison dataset because:
- **Demographics included** (age, gender, income, race) — we can compare attribute distributions
- **US nationally sampled** — different from our European-skewed population
- **Open access** — we can download and compare directly
- **8,400 participants** — statistically meaningful

**What we can validate:**
- Do our European users have different fingerprint entropy than US users?
- Do our self-selected users differ from a demographically balanced sample?
- Can we replicate Berke's demographic inference findings?

## Implementation: Cross-Dataset Comparison Tool

```python
# Pseudo-code for comparing our data to published datasets
def compare_entropy(our_data, published):
    for attribute in ['screenClass', 'engine', 'tzRegion']:
        our_entropy = compute_shannon(our_data[attribute])
        pub_entropy = published[attribute]
        difference = our_entropy - pub_entropy
        print(f"{attribute}: ours={our_entropy:.1f}b, published={pub_entropy:.1f}b, Δ={difference:+.1f}b")
```

This is already partially implemented in our `/api/analysis` endpoint which computes per-signal entropy. We just need to add the published baseline values for comparison.

## Recommendations

1. **Add published baselines to /api/analysis** — show how our entropy compares to Eckersley (2010) and Berke (2025)
2. **Download Berke et al. dataset** — compare our distributions to theirs
3. **Publish our own anonymized summary** — contribute to the community
4. **Stratify by country** — compare entropy across different geographic samples
