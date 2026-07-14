# HCI Design of Experiments — Evidence-Based UI/UX for Bot Detection & Privacy Leak Testing

**Date:** 2026-07-14  
**Source:** Synthesis of 2024-2026 HCI/security research, including LAURA Framework (MuC '25), Distler dissertation (vignette experiments), EUPSFUX framework

---

## 1. Research Foundation

### 1.1 LAURA Framework (Hoffmann, Müller & Fleig, MuC '25)
Security UX has five measurable dimensions:

| Dimension | Definition | Scrutari Application |
|-----------|-----------|---------------------|
| **Learnability** | Can users learn how to interpret results? | First-visit tutorial/? First-test clarity |
| **Actionability** | Can users act on the information? | Fix button for each leak? Export/Share |
| **Understandability** | Do users comprehend what each test means? | Plain-language explanations for each signal |
| **Relevance** | Is the information pertinent to the user? | Prioritize high-impact leaks (WebRTC > font enum) |
| **Abstraction** | Is the level of detail appropriate? | Layered: summary gauge → detail table → raw data |

### 1.2 Security UX Metrics (Distler, 2024)

| Metric | Measurement Method | Applies to Scrutari? |
|--------|-------------------|:--------------------:|
| **Perceived security** | 1-item scale post-test | ✅ Bot-or-Not confidence |
| **Comprehension** | Knowledge questions after test | ✅ Explain each signal |
| **Trust** | Standardized trust scale | ✅ Methodology transparency |
| **Behavioral intention** | "Will you change settings?" | ✅ Fix recommendations |
| **Task load** | NASA-TLX (simplified) | ✅ Recording duration toll |
| **Emotional response** | Geneva Emotions Wheel | ✅ Score emoji + color |

### 1.3 Security-Enhancing Friction (Distler)

> "Designing momentary negative UX to encourage secure behavior while
> maintaining acceptable overall UX."

For Scrutari: A slightly inconvenient test flow (15s behavioral recording)
that deters casual use but signals thoroughness to engaged users.

---

## 2. Current Scrutari UI/UX vs HCI Best Practices

### 2.1 What We're Doing Right

| Practice | Evidence | Current Implementation |
|----------|----------|----------------------|
| **Progressive disclosure** | Nielsen Norman: layered info reduces overwhelm | Wizard: 5 sections, summary → details |
| **Immediate feedback** | Shneiderman: response within 1s | Gauge animates on completion |
| **Consent before submission** | GDPR Art. 7, HCI ethics | Checkbox + data preview |
| **Color-coded severity** | Universal design pattern | Green/yellow/red for results |
| **Share/export results** | Social proof, community value | Score card download, social share |

### 2.2 What Needs Improvement

| Issue | HCI Problem | Evidence | Fix |
|-------|-------------|----------|-----|
| **No entry tutorial** | Learnability gap | LAURA: Learnability is foundational | Add 3-slide intro for first visit |
| **Signal names are technical** | Understandability gap | LAURA: Users must comprehend | "navigator.webdriver" → "Automation Tool Detected" |
| **No action recommendations** | Actionability gap | LAURA: Actionability is key | "Use a VPN" / "Disable WebRTC" buttons |
| **No progress indication for full suite** | Cognitive load | Miller 1956: 7±2 chunks | Add "Test 3/8 complete" counter |
| **Behavioral recording timing opaque** | Loss of control | Distler: friction must be transparent | Show countdown + event counter live |
| **No baseline comparison** | Missing relevance framing | Relevance dimension | "Your score: 48% (average: 35%)" |

---

## 3. Proposed UI/UX Layout (Evidence-Based)

### 3.1 Information Architecture

```
LANDING PAGE
  ├── Hero: One-sentence value prop + CTA
  ├── Privacy guarantee banner (top)
  ├── First-visit overlay: 3-slide tutorial
  │     Slide 1: "We check if your browser leaks info"
  │     Slide 2: "All tests run in your browser"
  │     Slide 3: "See your Bot-or-Not score"
  │
  └── Test suite (wizard, 5 steps, progress bar)
        ├── 1. NETWORK CHECK  (30s)
        │     ├─ GeoIP / Exit node
        │     ├─ DNS leak test
        │     └─ IPv6 connectivity
        │
        ├── 2. FINGERPRINT    (5-8s)
        │     ├─ Canvas / WebGL / Audio / Fonts
        │     ├─ PoW benchmark (background)
        │     └─ Automation detection
        │
        ├── 3. WEBRTC LEAK    (5-10s)
        │     ├─ 4 STUN techniques
        │     └─ IPv4 + IPv6 candidates
        │
        ├── 4. BEHAVIORAL     (15s)
        │     ├─ Mouse / Scroll / Key tracking
        │     └─ Progress bar + live event count
        │
        └── 5. RESULTS
              ├─ Bot-or-Not gauge (primary)
              ├─ Behavioral score (secondary)
              ├─ Signal breakdown (collapsible)
              ├─ Action items (prioritized)
              ├─ Baseline comparison ("vs. average user")
              └─ Share / Export / Submit
```

### 3.2 Visual Hierarchy for Results

```
┌─────────────────────────────────────────────────────────┐
│  🔍 Scrutari Bot-or-Not™                                 │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  🧑  Likely Human      15% bot, 85% human           │ │
│  │  └──●───────────────────────────────────────────┘   │ │
│  │  Human                     Uncertain          Bot    │ │
│  │  Confidence: High (92 of 95 signals tested)          │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  ⚡ Behavioral Analysis   12% bot-like              │ │
│  │  └─●────────────────────────────────────────────┘   │ │
│  │  57 events recorded · 15s analysis                   │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  ⚠ Findings (2 need attention)                     │ │
│  │                                                     │ │
│  │  🔴 WebRTC leak: Your real IP exposed via STUN     │ │
│  │     ℹ How to fix → Use a VPN or disable WebRTC     │ │
│  │                                                     │ │
│  │  🟡 Fingerprint: High entropy (22 bits)             │ │
│  │     ℹ Your browser is highly identifiable           │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  [Share] [Download Card] [Contribute to Research ☐]      │
└─────────────────────────────────────────────────────────┘
```

### 3.3 Vocabulary Map (Technical → Human)

| Current (Technical) | Proposed (Human) | Rationale |
|--------------------|-----------------|-----------|
| navigator.webdriver | Automation Tool Detected | LAURA: Understandability |
| Canvas Hash: 12456 bytes | Canvas Fingerprint: 12456 bytes | Plain language |
| WebGL Renderer: ANGLE | Graphics Card: Intel UHD | User-recognizable |
| PoW Time: 45.2ms | CPU Speed Test: 45.2ms | Metaphor (PoW is meaningless) |
| Signal count: 36/36 | Tests run: 36 of 36 | Completion framing |
| Entropy: 22.4 bits | Uniqueness: 1 in 5 million | Concrete vs. abstract |
| Bot-or-Not: 48% | Human-likeness: 52% | Positive framing |

---

## 4. Design of Experiments for UI Validation

### 4.1 Research Questions

1. **Primary:** Does the proposed UI improve user comprehension of privacy leaks
   compared to the current UI?
2. **Secondary:** Does action-oriented result display increase corrective behavior
   (e.g., enabling VPN, disabling WebRTC)?
3. **Tertiary:** Does progressive disclosure reduce cognitive load without hiding
   important information?

### 4.2 Experimental Design

**Type:** Within-subjects crossover design (each participant uses both UIs)

**Independent variable:** UI version (current vs. proposed)

**Dependent variables:**
- Comprehension score (0-10, knowledge questions after each condition)
- Task completion time (seconds)
- NASA-TLX workload score
- Perceived security (1-item scale)
- Behavioral intention (will you change settings? 1-5 Likert)
- System Usability Scale (SUS, 0-100)

**Covariates:**
- Technical expertise (self-rated 1-5)
- Privacy concern (Westin scale)
- Age, gender, browser, OS

**Hypotheses:**
- H₁: Proposed UI yields higher comprehension scores than current UI
- H₂: Proposed UI yields lower task load scores (NASA-TLX)
- H₃: Action-oriented display increases corrective behavior intention

**Sample size:** N=64 (Cohen's d=0.5, α=0.05, power=0.80 for paired t-test)

**Statistical methods:**
- Paired t-tests for H₁, H₂ (within-subject continuous outcomes)
- McNemar's test for H₃ (binary: intend to act vs. not)
- Benjamini-Hochberg FDR correction for 3 comparisons
- 95% bootstrapped CIs for effect sizes

### 4.3 Materials

- Prototype A (current Scrutari UI) — deployed at `?v=current`
- Prototype B (proposed UI) — deployed at `?v=proposed`
- Post-test questionnaire (Google Forms / self-hosted)
- Comprehension quiz (10 questions, 5 per condition)
- NASA-TLX (raw TLX, 6 items × 20-point scale)

### 4.4 Procedure

1. **Consent** (30s) — IRB-approved informed consent
2. **Randomization** — Coin flip: A→B or B→A
3. **Condition 1** (5 min) — Use UI version A, complete all tests
4. **Quiz 1** (2 min) — 5 comprehension questions about results
5. **NASA-TLX** (1 min) — Task load for version A
6. **Condition 2** (5 min) — Use UI version B, complete all tests
7. **Quiz 2** (2 min) — 5 comprehension questions about results
8. **NASA-TLX** (1 min) — Task load for version B
9. **Demographics** (1 min) — Expertise, privacy concern, age

### 4.5 Threats to Validity & Mitigations

| Threat | Mitigation |
|--------|-----------|
| **Order effects** | Crossover design + randomization |
| **Learning effects** | Different leak scenarios per condition (A: WebRTC, B: DNS) |
| **Selection bias** | Recruit from diverse channels (not just privacy forums) |
| **Novelty effect** | 1-week washout period between conditions |
| **Ecological validity** | Both versions run in real browser, not mockups |
| **Demand characteristics** | Cover story: "evaluating two privacy tools" |

---

## 5. Metrics Dashboard for Ongoing Measurement

Once the experiment validates the UI, embed these metrics in the SPA for continuous monitoring:

### 5.1 Behavioral Metrics (anonymized)

```json
{
  "interactionMetrics": {
    "testsStarted": 1,           // User began test suite
    "testsCompleted": 5,         // Completed all 5 sections
    "abandonmentStep": null,     // Where they dropped off, if any
    "behavioralEvents": 57,      // Events during recording
    "submitted": true,           // Contributed to research
    "shared": false,             // Shared results
    "timeOnPage": 120000,        // Total time (ms)
    "sectionTimes": [12, 45, 18, 30, 15], // Seconds per section
    "expandCount": 3,            // Times expanded signal details
    "helpClicked": false         // Clicked help/info tooltips
  }
}
```

### 5.2 Key Performance Indicators

| KPI | Target | Measurement |
|-----|:------:|-------------|
| Completion rate | >80% | Started vs. completed |
| Abandonment at WebRTC | <15% | Step 3 drop-off |
| Abandonment at Behavioral | <20% | Step 4 drop-off |
| Submission rate | >30% | Completed → submitted |
| Share rate | >10% | Completed → shared |
| Signal detail expansion | >50% | Expanded at least once |
| Average session time | 2-5 min | Expected for thorough test |

### 5.3 Statistical Process Control

Use control charts (p-charts for proportions) to detect when a UX change
significantly impacts behavior. Upper/lower control limits at 3σ:

```python
UCL = p + 3 * sqrt(p * (1-p) / n)   # Upper control limit
LCL = max(0, p - 3 * sqrt(p * (1-p) / n))  # Lower control limit
```

Signal when the completion rate drops below LCL for 7 consecutive days
(Nelson Rule 1: point beyond 3σ).

---

## 6. Recommended Priority Actions

| # | Action | Evidence | Effort | Impact |
|:-:|--------|----------|:------:|:------:|
| 1 | **Add plain-language signal labels** | LAURA: Understandability | 1 hr | High |
| 2 | **Add action recommendations for each finding** | LAURA: Actionability | 2 hrs | High |
| 3 | **Show baseline comparison ("vs. average")** | Relevance dimension | 1 hr | Medium |
| 4 | **Add live event counter during behavioral recording** | Transparency, Distler friction | 30 min | Medium |
| 5 | **Replace "Bot-or-Not" with "Human-likeness" positive framing** | Positive bias in HCI | 15 min | Low |
| 6 | **Add first-visit tutorial overlay** | Learnability | 4 hrs | Medium |
| 7 | **Embed interaction metrics in submission payload** | KPIs for continuous improvement | 2 hrs | High |
| 8 | **Conduct N=64 crossover experiment** | Validate all above changes | 2 weeks | High |

---

## References

1. Hoffmann, Müller & Fleig. "LAURA: A Framework for Assessing the Usability of
   IT Security Policies." *Proceedings of Mensch und Computer 2025 (MuC '25)*.
   DOI: 10.1145/3743049.3743052

2. Distler, V. "Security Perceptions in HCI." PhD Dissertation, 2024.
   Empirical vignette experiments with up to 2,400 participants.

3. "Framework for Evaluating UX of End User Security Features (EUPSFUX)."
   PhD Dissertation excerpt. Construct identification + mixed-methods validation.

4. Nielsen, J. "10 Usability Heuristics for User Interface Design." NN/g, 1994
   (updated 2024).

5. Sauro, J. & Lewis, J.R. "Quantifying the User Experience." Morgan Kaufmann, 2016.
   Practical statistics for UX research.

6. Shneiderman, B. "Eight Golden Rules of Interface Design." 1987 (updated).

7. Brooke, J. "SUS: A Quick and Dirty Usability Scale." 1996.
