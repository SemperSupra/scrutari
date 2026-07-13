# Literature Review: Browser Fingerprinting & Bot Detection

**Date:** July 2026
**Scope:** Foundational and state-of-the-art works from top venues (PETS, WWW, IEEE S&P, NDSS, USENIX, ACM CCS)

---

## 1. Foundational Works

### 1.1 Eckersley (2010) — Panopticlick
**"How Unique Is Your Web Browser?"**
*PETS 2010, Springer LNCS 6205. 852+ citations.*

- **Method:** 470K browser fingerprints via panopticlick.eff.org
- **Key finding:** ~18.1 bits entropy → 1 in 286K browsers unique; 83.6% of fingerprints unique
- **Per-attribute entropy:** Plugins 15.4b, Fonts 13.9b, UA 10.0b, Screen 4.8b, Timezone 3.0b
- **Limitation:** Privacy-conscious sample; Flash/Java-dependent; ignored attribute correlations
- **Our relevance:** Entropy framework adopted; per-attribute breakdown informs our signal weighting

### 1.2 Gómez-Boix, Laperdrix, Baudry (2018) — Hiding in the Crowd
**WWW 2018 (The Web Conference). ACM.**
- **Method:** 2,067,942 fingerprints from top-15 French website (general audience, not privacy-aware)
- **Key finding:** Only 33.6% of fingerprints unique (vs Eckersley's 83.6%). Non-unique fingerprints are fragile
- **Mobile:** Even lower uniqueness (18.5%)
- **Our relevance:** K-anonymity framework; demonstrates selection bias in prior work

### 1.3 Laperdrix et al. (2020) — Browser Fingerprinting Survey
**ACM Computing Surveys, 2020.**
- Comprehensive survey of fingerprinting techniques, defenses, and research up to 2019
- Taxonomizes fingerprinting into: JS-based, CSS-based, extension-based, network-based
- **Our relevance:** Framework for categorizing our 36+26 signals

---

## 2. Google's Privacy Sandbox & Entropy Research

### 2.1 Bacis, Bilogrevic et al. (2024) — Assessing Web Fingerprinting Risk
**WWW 2024 (Companion). Google Research. arXiv: 2403.15607.**
- **Method:** Tens of millions of Chrome browsers, 161 Web APIs → 5,383 surfaces
- **Key contribution:** Chow-Liu decomposition for correlation-aware entropy estimation
- **Finding:** Naive sum-of-entropies overestimates by ~30%; correlations matter
- **Privacy Budget:** Chrome's proposed mechanism limits fingerprinting entropy to ~2 bits/site
- **Our relevance:** Directly supports our entropy calculation methodology; validates concern about overestimation

---

## 3. Bot Detection Research

### 3.1 Vastel et al. (2020) — FP-Crawlers
**MADWeb/NDSS Workshop 2020.**
- **Method:** Crawled Alexa top 10K; 291 websites found blocking crawlers
- **Finding:** 31.96% of blocking sites use browser fingerprinting
- **Conclusion:** Fingerprinting can be bypassed with little effort by knowledgeable adversaries
- **Our relevance:** Confirms arms race; validates need for multi-signal approach

### 3.2 Vastel (2024) — CDP Runtime Detection
**DataDome Threat Research, June 2024.**
- **Technique:** Detects automation via `Runtime.consoleAPICalled` — Error.stack serialization
- **Evasion:** nodriver, Selenium Driverless avoid `Runtime.enable`
- **Current state (2026):** Cat-and-mouse; patches released, then break, then re-patched
- **Our relevance:** This is the CURRENT standard for commercial bot detection

### 3.3 DataDome (2024) — Picasso Device Class Fingerprinting
**DataDome, Feb 2024.**
- **Method:** Canvas-based device class verification (originally Google)
- **Application:** Detects bots lying about OS/browser/GPU
- **Scale:** Blocked 4M+ malicious CAPTCHA-passing attempts in 30 days
- **Our relevance:** Cross-referencing WebGL renderer with claimed OS

---

## 4. AI Agent Detection (2026 State-of-the-Art)

### 4.1 FP-Agent (Wang, Shafiq, Vekaria — UC Davis)
**arXiv 2605.01247, May 2026.**
- **Method:** Controlled study of 7 AI browsing agents vs 56 humans
- **Key findings:**
  - Behavioral fingerprints: ~0.999 F1 (near-perfect)
  - Browser fingerprints alone: ~0.80 F1 (insufficient)
  - Cloudflare blocks only 1 of 7 agents
  - Agents paste text (Ctrl+V) rather than type; teleport mouse; scroll discontinuously
  - Combined classifier: at least 1 minute of observation needed
- **Our relevance:** DIRECTLY validates our behavioral engine approach; identifies paste detection as critical gap

### 4.2 MARK — Multi-Layer Agent Fingerprinting (Kang et al., UMass Amherst)
**arXiv 2606.20910, June 2026.**
- **Method:** 4-layer features: request timing, TLS, HTTP, in-browser behavior
- **Finding:** 97% accuracy with decision tree; network-level features work early
- **Agents tested:** AutoGen, Browser Use, Claude, Gemini, Operator, Skyvern
- **Our relevance:** Validates multi-signal fusion; suggests network-level features we don't currently use

### 4.3 Known By Their Actions (Lugoloobi et al., Oxford Internet Institute)
**arXiv 2605.14786, May 2026.**
- **Method:** Passive JS tracker captures UI actions and interaction timings
- **Finding:** Inter-event intervals (IEIs) alone identify LLM model with 96% F1
- **14 frontier models distinguishable by timing patterns alone**
- **Our relevance:** Supports our typing speed variance signal; suggests IEI distribution analysis

---

## 5. Behavioral Biometrics Research

### 5.1 BeCAPTCHA-Mouse (Acien et al., 2022)
**Pattern Recognition (Elsevier), 2022.**
- **Method:** Sigma-Lognormal model for neuromotor features from mouse trajectories
- **Finding:** 93% accuracy from single trajectory; velocity profile is most discriminative feature
- **Synthetic evasion:** GAN-based trajectories fool classifiers 17% of the time
- **Our relevance:** Validates velocity analysis; we don't currently compute acceleration/deceleration

### 5.2 DMTG (Liu et al., 2024)
**arXiv 2410.18233, 2024.**
- **Method:** Diffusion-based mouse trajectory generator with entropy control
- **Finding:** Reduces detection by 4.75-9.73% vs GAN/RL methods
- **Our relevance:** Demonstrates adversarial trajectory generation is advancing; our detection must evolve

### 5.3 Wang et al. (2025) — Mouse Dynamics Authentication
**arXiv 2504.21415, 2025.**
- **Method:** Approximate Entropy (ApEn) for mouse dynamics segment optimization
- **Finding:** 98.52% AUC on DFL dataset; 94.65% on Balabit; reduces data needs 10×
- **Our relevance:** ApEn could be used for micro-movement analysis (unimplemented gap)

### 5.4 IEEE Access (2026) — Comparative Defense Evaluation
**IEEE Access, 2026.**
- **Method:** Evaluates ML models, DTW, and click-pattern analysis
- **Critical finding:** No single technique is sufficient; session replay undetectable
- **Our relevance:** Confirms our multi-signal approach; highlights replay attack gap

---

## 6. Browser Fingerprint Evolution & Stability

### 6.1 Vastel et al. (2018) — FP-STALKER
**IEEE S&P 2018.**
- **Method:** Tracks fingerprint evolution over time
- **Finding:** Fingerprints change but can be tracked across changes
- **Our relevance:** Informs our firstSeen/lastSeen tracking methodology

### 6.2 Boussaha et al. (2024) — FP-Tracer
**PoPETs 2024 (Proceedings on Privacy Enhancing Technologies).**
- **Method:** Taint-tracking for fingerprinting detection; entropy-based thresholds
- **Finding:** Classifies fingerprinters by severity level
- **Our relevance:** Validates entropy-threshold approach for classification

---

## 7. Privacy Budget & Browser Defenses

### 7.1 Chrome Privacy Budget (2024-2026)
- **Concept:** Limit fingerprinting entropy to ~2 bits per site per day
- **Status:** Proposed but not fully implemented; API surface reduction ongoing
- **Our relevance:** If implemented, would reduce effectiveness of static fingerprint signals; increases importance of behavioral signals

### 7.2 Safari Intelligent Tracking Prevention (ITP)
- **Status:** Active; limits 3rd-party cookies, partitions storage
- **Our relevance:** ITP-affected browsers may have different fingerprint characteristics

---

## 8. Methodological Gaps in Literature

| Gap | Evidence | Our Opportunity |
|-----|----------|----------------|
| Small participant pools | Most studies: 10-120 users | We could reach thousands |
| Lab conditions | Restricted tasks, known observation | Real users, natural behavior |
| Temporal scope | Cross-sectional or weeks | Continuous longitudinal |
| Single platform | Desktop-only or Chrome-only | Multi-browser (our 7 configs) |
| No self-assessment | No comparison vs user perception | Self-assessment (1-5 scale) |
| Limited agent types | 1-7 agents per study | Expandable via baselines.mjs |

---

## 9. Implications for Scrutari

### Confirmations
- Multi-signal approach is validated by MARK and FP-Agent ✓
- Behavioral > browser fingerprint (FP-Agent: 0.999 vs 0.80) ✓
- Typing variance is highly discriminative (Known By Their Actions) ✓
- Velocity profiles are key (BeCAPTCHA) ✓

### Gaps Identified
1. **Paste detection** — FP-Agent agents use Ctrl+V, bypassing typing signals
2. **Velocity profile analysis** — BeCAPTCHA's most discriminative feature, missing
3. **CDP Runtime detection** — Current commercial standard (Vastel 2024), not implemented
4. **Replay attack defense** — No known solution (IEEE Access 2026)
5. **Inter-event interval distribution** — 96% F1 agent identification (Known By Their Actions)

### References

1. Eckersley, P. "How Unique Is Your Web Browser?" PETS 2010.
2. Gómez-Boix, A., Laperdrix, P., Baudry, B. "Hiding in the Crowd." WWW 2018.
3. Laperdrix, P., et al. "Browser Fingerprinting: A Survey." ACM CS 2020.
4. Bacis, E., et al. "Assessing Web Fingerprinting Risk." WWW 2024.
5. Vastel, A., et al. "FP-Crawlers." MADWeb/NDSS 2020.
6. Vastel, A. "CDP Runtime Detection." DataDome 2024.
7. Wang, E., Shafiq, Z., Vekaria, Y. "FP-Agent." arXiv 2605.01247, 2026.
8. Kang, D., et al. "MARK." arXiv 2606.20910, 2026.
9. Lugoloobi, W., et al. "Known By Their Actions." arXiv 2605.14786, 2026.
10. Acien, A., et al. "BeCAPTCHA-Mouse." Pattern Recognition, 2022.
11. Liu, et al. "DMTG." arXiv 2410.18233, 2024.
12. Wang, et al. "Mouse Dynamics Authentication." arXiv 2504.21415, 2025.
13. Vastel, A., et al. "FP-STALKER." IEEE S&P 2018.
14. Boussaha, et al. "FP-Tracer." PoPETs 2024.
