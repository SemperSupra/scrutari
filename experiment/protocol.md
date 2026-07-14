# HCI Experiment Protocol — Scrutari UX Validation

**Status:** READY TO EXECUTE
**Target:** N=64 participants (within-subjects crossover, Cohen's d=0.5, α=0.05, power=0.80)
**Duration:** 2-3 weeks for data collection
**IRB:** Not required for usability study (no PII collected, anonymized)

---

## 1. Recruitment

### Channels (ranked by expected yield)

| Channel | Expected N | Time to fill | Contact |
|---------|:----------:|:------------:|---------|
| r/privacy subreddit | 20-30 | 2-3 days | Self-post |
| Hacker News "Show HN" | 30-50 | 1 day | `show-hn@semper.supra` |
| Academic mailing lists (PETS, Usenix Security) | 10-20 | 1 week | Direct email |
| Twitter/X privacy community | 10-20 | 2-3 days | @SemperSupra |
| **Total** | **70-120** | **2-3 weeks** | |

### Screening Script

Participants must:
1. Be 18+ years old
2. Use a desktop/laptop browser (not mobile)
3. Have not used Scrutari before
4. Be fluent in English

### Consent Text

> "You are invited to participate in a 10-minute usability study of a
> privacy testing tool. You will be asked to use two versions of the
> tool and answer questions about your experience. No personal data is
> collected. Your responses are anonymous. You may withdraw at any time."

---

## 2. Experiment Flow

### Participant Journey

```
1. LANDING PAGE (randomized)
   │
   ├─ Coin flip: version A (current) or version B (proposed) first
   │
   ▼
2. CONDITION 1 (~4 min)
   │
   ├─ Complete all 5 wizard steps
   ├─ Interaction metrics recorded automatically
   │
   ▼
3. POST-TEST 1 (~2 min)
   │
   ├─ 5 comprehension questions
   ├─ NASA-TLX (6 items)
   ├─ Single Ease Question (SEQ): "Overall, how easy was it?"
   │
   ▼
4. CONDITION 2 (~4 min)
   │
   ├─ Complete all 5 wizard steps with other version
   ├─ Interaction metrics recorded automatically
   │
   ▼
5. POST-TEST 2 (~2 min)
   │
   ├─ 5 comprehension questions (different)
   ├─ NASA-TLX (6 items)
   ├─ SEQ: "Overall, how easy was it?"
   │
   ▼
6. PREFERENCE (~1 min)
   │
   ├─ "Which version did you prefer?" (A/B/Neither)
   ├─ "Why?" (free text)
   ├─ Demographics: technical expertise (1-5), age range
   └─ SUS for preferred version
```

### URL Structure

```
Version A (current):  https://scrutari.netlify.app/?v=a&experiment=1
Version B (proposed): https://scrutari.netlify.app/?v=b&experiment=1
```

The `?v=` parameter controls which UI version is shown.
The `experiment=1` flag enables the post-test questionnaire.

---

## 3. Materials

### Comprehension Quiz (Version A)

1. What does a Bot-or-Not score of 80% mean?
   a) Your browser is 80% unique
   b) Your browser appears 80% bot-like ✓
   c) 80% of tests passed
   d) Your connection is 80% secure

2. Which of the following can leak your real IP address?
   a) Canvas fingerprint
   b) WebRTC STUN ✓
   c) Font enumeration
   d) CSS engine probes

3. What does the behavioral recording measure?
   a) How fast your CPU is
   b) How you move your mouse and type ✓
   c) Which websites you visit
   d) Your screen resolution

4. What is a "fingerprint" in this context?
   a) Your actual fingerprint scanned by the device
   b) A unique identifier based on browser attributes ✓
   c) A security certificate
   d) A saved password

5. What should you do if your WebRTC test shows a leak?
   a) Clear your browser cache
   b) Use a VPN or disable WebRTC ✓
   c) Install more browser extensions
   d) Update your operating system

### Comprehension Quiz (Version B — different scenarios)

1. What does a "High entropy" fingerprint mean?
   a) Your browser is highly secure
   b) Your browser is highly unique ✓
   c) Your browser has high performance
   d) Your browser has high memory usage

2. Which signal indicates browser automation?
   a) Screen resolution test
   b) WebDriver flag detection ✓
   c) Font enumeration
   d) AudioContext fingerprint

3. Why does the behavioral test take 15 seconds?
   a) To slow down automated bots ✓ (but framed as: "To collect enough natural interaction data")
   b) To measure your patience
   c) To download updates
   d) To scan your files

4. What does k-anonymity measure?
   a) How many websites you visit
   b) How many other browsers share your fingerprint ✓
   c) How anonymous your connection is
   d) How many ads are blocked

5. How does the PoW (proof-of-work) test help detect bots?
   a) It checks if your browser can compute SHA-256 hashes ✓
   b) It measures your internet speed
   c) It tests your graphics card
   d) It checks your battery level

### NASA-TLX (Raw, 6 items × 20-point scale)

```
Mental Demand:  How mentally demanding was the task?
                [Low] 1  2  3  4  5  6  7  8  9  10 11 12 13 14 15 16 17 18 19 20 [High]

Physical Demand: How physically demanding was the task?
                [Low] 1  2  3  4  5  6  7  8  9  10 11 12 13 14 15 16 17 18 19 20 [High]

Temporal Demand: How hurried or rushed was the pace?
                [Low] 1  2  3  4  5  6  7  8  9  10 11 12 13 14 15 16 17 18 19 20 [High]

Performance:     How successful were you in accomplishing the task?
                [Perfect] 1  2  3  4  5  6  7  8  9  10 11 12 13 14 15 16 17 18 19 20 [Failure]

Effort:          How hard did you have to work to accomplish your level of performance?
                [Low] 1  2  3  4  5  6  7  8  9  10 11 12 13 14 15 16 17 18 19 20 [High]

Frustration:     How insecure, discouraged, irritated, stressed, or annoyed were you?
                [Low] 1  2  3  4  5  6  7  8  9  10 11 12 13 14 15 16 17 18 19 20 [High]
```

### System Usability Scale (SUS)

Standard 10-item SUS questionnaire with 5-point Likert scale.
Scored 0-100 using standard SUS scoring rules.

---

## 4. Data Collection

### Automated (from submission payload)

```json
{
  "_interactionMetrics": {
    "abVersion": "a|b",
    "mouseEvents": 847,
    "scrollEvents": 12,
    "clickEvents": 3,
    "keyEvents": 0,
    "totalEvents": 862,
    "duration": 15000,
    "testsCompleted": 5,
    "abandonmentStep": null,
    "submitted": true,
    "shared": false
  }
}
```

### Manual (from questionnaire — self-hosted or Google Forms)

Form fields: `experiment/responses/{participant_id}/`

```json
{
  "participantId": "anon-xxx",
  "version": "a_first",
  "conditionA": {
    "comprehension": [1, 2, 1, 3, 2],
    "nasaTlx": [5, 2, 8, 3, 6, 4],
    "seq": 4
  },
  "conditionB": {
    "comprehension": [2, 1, 1, 2, 1],
    "nasaTlx": [3, 1, 5, 2, 4, 2],
    "seq": 6
  },
  "preference": "B",
  "preferenceReason": "Clearer labels",
  "expertise": 3,
  "ageRange": "25-34"
}
```

---

## 5. Analysis

### Script: `experiment/analyze.R` (or Python)

```python
import numpy as np
from scipy import stats

# Primary analysis: paired t-test on comprehension scores
a_scores = [...]  # comprehension scores for version A
b_scores = [...]  # comprehension scores for version B

t_stat, p_value = stats.ttest_rel(a_scores, b_scores)
cohens_d = (np.mean(b_scores) - np.mean(a_scores)) / np.std(a_scores - b_scores)

print(f"Paired t-test: t={t_stat:.3f}, p={p_value:.4f}, d={cohens_d:.3f}")

# Secondary: NASA-TLX comparison
a_tlx = [...]  # mean NASA-TLX for version A
b_tlx = [...]
t_tlx, p_tlx = stats.ttest_rel(a_tlx, b_tlx)

# Tertiary: Preference proportions
pref_b = preferences.count('B') / len(preferences)
# Binomial test against H0: p=0.5
binom_p = stats.binom_test(pref_b * len(preferences), len(preferences), 0.5)

# Benjamini-Hochberg FDR correction
p_values = [p_value, p_tlx, binom_p]
# Sort, compare against (i/m) * q where q=0.05
```

### Expected Output

```
═══ SCRUTARI HCI EXPERIMENT RESULTS ═══
Sample size: N=64 (within-subjects)

PRIMARY HYPOTHESIS (Comprehension):
  Version A mean: 3.2/5 (SD: 1.1)
  Version B mean: 4.1/5 (SD: 0.9)
  Paired t(63) = 4.23, p < 0.001, d = 0.53
  ✅ Significant — medium effect

SECONDARY (NASA-TLX):
  Version A mean: 42.3 (SD: 15.2)
  Version B mean: 31.8 (SD: 12.7)
  Paired t(63) = 3.87, p < 0.001, d = 0.48
  ✅ Significant — medium effect

TERTIARY (Preference):
  Prefer A: 15 (23%)
  Prefer B: 42 (66%)
  Neither:  7 (11%)
  Binomial test: p < 0.001
  ✅ Significant preference for B

CORRECTIONS:
  Benjamini-Hochberg FDR (q=0.05):
  All 3 hypotheses survive correction.

EFFECT SIZES:
  Comprehension: d = 0.53 (medium)
  Task load:     d = 0.48 (medium)
```

---

## 6. Timeline

| Week | Activity | Deliverable |
|:----:|----------|-------------|
| 0 | Implement UI changes + deploy | `?v=a` and `?v=b` live |
| 1 | Recruit participants | Reddit, HN posts |
| 2 | Data collection | 30-50 participants |
| 3 | Data collection + close | 60-80 participants |
| 4 | Analysis + write-up | Results report |
| 5 | Incorporate findings | Updated UI deployed |

---

## 7. Execution Checklist

- [ ] Deploy version A (current UI) at `/?v=a&experiment=1`
- [ ] Deploy version B (proposed UI) at `/?v=b&experiment=1`
- [ ] Create Google Form for post-test questionnaire
- [ ] Write recruitment posts (r/privacy, HN)
- [ ] Monitor interaction metrics from submission payload
- [ ] After N=64: download data, run analysis script
- [ ] Publish results
