# Critical Analysis: Detection Methodology & Implementation Strategy

Based on 2024-2026 research from: BeCAPTCHA-Mouse (Acien et al.), DMTG (Liu et al.),
FP-Agent (Wang et al.), MARK (Kang et al.), Known By Their Actions (Lugoloobi et al.),
and IEEE Access comparative evaluations.

---

## Part 1: Evidence Supporting Our Approach

### 1. Multi-Signal Fusion is Validated
**MARK (Kang et al., UMass Amherst, arXiv 2606.20910, June 2026)** achieves **97% accuracy**
using multi-layer features: request timing, TLS, HTTP, and in-browser behavior. This directly
validates our multi-signal approach (36 static + 26 behavioral signals).

**FP-Agent (Wang et al., UC Davis, arXiv 2605.01247, May 2026)** found that behavioral
fingerprints alone achieve ~0.999 F1 for distinguishing AI agents from humans — dramatically
outperforming browser fingerprints alone (~0.80 F1). **Our behavioral engine is on the right track.**

### 2. Mouse Movement Features We Already Capture Are Correct
**BeCAPTCHA-Mouse (Acien et al., Pattern Recognition 2022, 93% accuracy)** found that
velocity profile (acceleration + deceleration) is the most discriminative feature. Our current
signals include speed variance and path curvature — both velocity-related features.

The **Bureau analysis** of the DELBOT-Mouse dataset confirms:
- Humans: curved paths, low efficiency (detours), wide angle distribution, irregular pauses ✓
- Bots: linear paths, high efficiency, sharp angle peaks at 0°/90°/180°, narrow pause clusters ✓
- We already detect: path curvature (w4), speed variance (w4), pause frequency (w3) ✓

### 3. Typing Variance Detection is Critical
**FP-Agent** found typing behavior is one of the TOP distinguishing signals:
- Inter-key latency means and variances
- Hold latency statistics
- Paste vs. keystroke detection
- Our signals: typing speed variance (w3), natural typing speed (w3), corrections (w2) ✓

### 4. AI Agents Currently Don't Evade Detection
**FP-Agent** explicitly states: "Current agents do not actively evade detection out of the box."
They use stable execution environments with telltale quirks (paste input, teleporting mouse,
instant scrolling). **Our 4% human simulation score confirms it's possible to detect them.**

---

## Part 2: Evidence Contradicting / Challenging Our Approach

### 1. Browser Fingerprints Are Insufficient Alone
**FP-Agent** found browser-fingerprint-only classifiers achieve only ~0.80 F1 — multiple AI
agents share IDENTICAL fingerprints (Atlas, Browser Use, Claude all produce same macOS
fingerprint). **Our static fingerprint signals (36 signals) are important but insufficient alone.**

**Implication:** Our behavioral engine (26 signals) is essential. Without it, our detection would
miss 20% of agents. The 0.80 F1 of browser fingerprints alone is concerning — it means
20% of agents look exactly like humans at the fingerprint level.

### 2. Velocity Profiles Can Be Faked
**BeCAPTCHA-Mouse** found that synthetic trajectories with realistic velocity profiles fooled
classifiers **17% of the time**. **DMTG (Liu et al., 2024)** uses diffusion networks to generate
human-like trajectories, reducing detection by **4.75-9.73%**.

**Implication:** Our mouse movement signals (speed variance, curvature, pauses) can be
evaded. Trajectory generation is an active research area, and evasion will improve.

### 3. Session Replay Attacks Are Nearly Undetectable
The **IEEE Access comparative evaluation (2026)** found that session-replay bots — where
genuine human trajectories are captured and replayed — are the most challenging threat.
NEAR-exact replication of human behavior makes detection extremely difficult.

**Implication:** We have NO defense against replay attacks. An attacker who records a real
human session and replays it would score 0% bot. This is a fundamental limitation that no
behavioral system fully addresses.

### 4. Template Aging & Concept Drift
**Sayyad et al. (2025)** found that mouse behavior changes over time due to fatigue, practice,
and new hardware. Most systems lack continuous adaptation mechanisms.

**Implication:** Our human-likeness thresholds will drift. A user who was 10% bot-like in
January might be 25% bot-like in June simply because their mouse behavior changed.
We need periodic recalibration.

### 5. Limited Dataset Generalizability
Most studies use 10-120 participants (Balabit: 10, DFL: 21, SapiMouse: 120). **Wang et al.
(2025)** questions generalizability across demographics, devices (trackpad vs. mouse),
and real-world contexts.

**Implication:** Our system needs data from THOUSANDS of users to be scientifically valid.
The studies showing 93-97% accuracy are likely overestimates for real-world deployment.

### 6. AI Agents Use Paste, Not Typing
**FP-Agent** found that ChatGPT Agent, Atlas, and Comet use **Ctrl+V paste** rather than
character-by-character typing. Claude uses only a `change` event. **We currently have NO
signal for paste-based input detection.**

**Implication:** Our typing signals (speed variance, corrections, hesitation) are completely
bypassed by paste-based agents. We need to add paste event detection.

### 7. Cloudflare Blocks Only 1 of 7 AI Agents
**FP-Agent** tested Cloudflare's bot management and found it blocked only 1 of 7 agents
(Manus). Our system would need to outperform industry standard.

**Implication:** This is either validating (our system could be better than Cloudflare) or
sobering (if commercial solutions with millions in R&D can't detect these agents, how
can we?). We should benchmark against Cloudflare.

### 8. Open-Set Detection is Harder
**FP-Agent** found that while closed-set detection (known agents) works well, open-set
detection (unknown agents) has lower F1. New agent types will emerge.

**Implication:** Our system needs anomaly detection, not just classification. Unknown agent
types won't match our training distribution.

---

## Part 3: Gaps Between Current Implementation & State-of-the-Art

| Gap | Impact | SotA Solution | Our Status |
|-----|:------:|---------------|:-----------:|
| Velocity profile analysis | High | BeCAPTCHA: Sigma-Lognormal model | ❌ Not implemented |
| Micro-movement entropy | High | Approximate Entropy (ApEn) at <10px | ❌ Not implemented |
| Paste vs. keystroke detection | High | FP-Agent: input event type classification | ❌ Not implemented |
| Replay attack detection | Medium | DTW + historical comparison | ❌ Not implemented |
| Template aging adaptation | Medium | Continuous model updating | ❌ Not implemented |
| Trajectory optimality score | Medium | Compare actual vs. shortest path | ❌ Not implemented |
| Overshoot frequency | Medium | Count of target corrections | ❌ Not implemented |
| Inter-event interval distributions | Medium | Known By Their Actions: IEI analysis | 🟡 Partial (typing intervals) |
| Scroll behavior classification | Medium | FP-Agent: discrete vs. continuous scroll | 🟡 Partial (pause detection) |
| Cross-domain replay defense | Low | Context validation | ❌ Not implemented |
| Open-set agent detection | Low | Anomaly thresholding | ❌ Not implemented |
| Multi-layer network + behavioral fusion | Low | MARK: decision tree over 4 layers | ❌ Not implemented |

---

## Part 4: Implementation Strategy

### Phase 1: Immediate (Week 1) — Critical Gaps
**Effort: 2 days. Impact: High.**

1. **Add paste event detection to behavioral engine**
   ```javascript
   // Track 'paste' events on input fields
   document.addEventListener('paste', __trackPaste, {passive:true});
   function __trackPaste(e) {
     __behavior.events.paste = __behavior.events.paste || [];
     __behavior.events.paste.push({ t: performance.now(), target: e.target?.id || '' });
   }
   ```
   - Signal: "Paste-based input detected" (w3) — bots paste, humans type
   - Catches ChatGPT Agent, Atlas, Comet immediately

2. **Add velocity profile analysis to mouse tracking**
   ```javascript
   // Current: tracks {x, y, t}
   // Add: compute acceleration/deceleration per segment
   function analyzeVelocityProfile(mouseEvents) {
     // Compute velocity (px/ms) for each segment
     // Compute acceleration (change in velocity)
     // Human velocity profile: gradual acceleration, gradual deceleration
     // Bot velocity profile: instant acceleration, constant velocity, instant stop
   }
   ```
   - Signal: "Natural velocity profile" (w4)
   - BeCAPTCHA-Mouse found this is the most discriminative feature (93% accuracy)

### Phase 2: Short-term (Week 2-3) — Medium Gaps
**Effort: 5 days. Impact: Medium-High.**

3. **Add trajectory optimality score**
   ```javascript
   function computeTrajectoryOptimality(mouseEvents) {
     // Compute actual path length
     // Compute Euclidean distance (shortest path)
     // ratio = actual / shortest
     // Human: ratio > 2.0 (path is 2x+ longer than needed)
     // Bot: ratio < 1.2 (near-optimal path)
   }
   ```
   - Signal: "Trajectory optimality" (w3)
   - Humans take winding paths; bots go straight

4. **Add overshoot frequency analysis**
   ```javascript
   function computeOvershootFrequency(clickEvents, mouseEvents) {
     // Before each click, check if mouse passed target and corrected
     // Record: number of micro-corrections per click
   }
   ```
   - Signal: "Mouse overshoot corrections" (w3)
   - Humans overshoot and correct; AI agents don't

5. **Add scroll pattern classification**
   ```javascript
   function classifyScrollPattern(scrollEvents) {
     // Continuous vs. discrete scrolling
     // Scroll distance distribution
     // Reading pause frequency
   }
   ```
   - Signal improvement: currently just "reading pauses" — add scroll type classification
   - FP-Agent: discrete scrolling (instant jumps) = agent; continuous = human

### Phase 3: Medium-term (Month 2) — Foundational Improvements
**Effort: 10 days. Impact: Medium.**

6. **Add inter-event interval analysis**
   - Model the FULL distribution of inter-event times, not just mean/variance
   - Known By Their Actions: IEI distributions identify the specific LLM agent
   - Signal: "Natural inter-event interval distribution" (w3)

7. **Build replay attack benchmark**
   - Record a real human session
   - Replay it through our system
   - Verify it scores 0% bot (it should! If not, we have a false positive problem)
   - If it DOES score 0% bot, document as a known limitation

8. **Add paste detection to Bot-or-Not engine**
   ```javascript
   test(3, 'Paste-based input', true, function() {
     return (fp['Input Method'] || '').includes('paste');
   });
   ```

### Phase 4: Long-term (Month 3+) — Research-Grade
**Effort: Ongoing. Impact: Research publication.**

9. **Implement Approximate Entropy (ApEn) for micro-movements**
   - Wang et al. (2025): ApEn optimized for authentication, 98.52% AUC
   - Compute entropy of mouse position at <10px resolution
   - Humans: high entropy (noisy, varied micro-movements)
   - AI agents: low entropy (consistent, optimal micro-movements)

10. **Open-set agent detection via anomaly thresholding**
    - Instead of binary (bot/human), output anomaly score
    - Unknown agents produce different feature distributions
    - Threshold-based: flag anything outside training distribution

11. **Cross-reference with known agent benchmarks**
    - FP-Agent identified 7 specific agent types
    - Run each against our system
    - Publish comparison: "Scrutari detected X of 7 agents vs Cloudflare's 1 of 7"

---

## Part 5: Critical Self-Assessment

### What We Do Well
1. **Static fingerprint signals** (36 signals) — comprehensive, covers all known automation vectors
2. **Behavioral analysis** (26 signals) — validates research showing behavior > fingerprints
3. **Honeypot/tarpit** — 40+ paths, stealth JS tracking, session tracking, achieves 88/88 tests
4. **Human-like simulation at 4%** — proves our detection catches sophisticated automation
5. **Multi-suite test coverage** — 123 tests across state machine + honeypot, all 100%

### What We Do Poorly
1. **No paste detection** — AI agents that paste bypass our typing signals
2. **No velocity profile analysis** — most discriminative mouse feature, missing
3. **No trajectory optimality** — can't distinguish optimal (bot) from sub-optimal (human)
4. **No overshoot detection** — human micro-corrections are a strong signal
5. **No replay attack defense** — fundamental limitation, no mitigation
6. **No open-set detection** — unknown agent types get past classification
7. **Limited sample size** — N=5 submissions is not publishable

### Our Research Contribution
Despite these gaps, our system has a unique strength: **we collect REAL data from REAL users
in REAL browsing conditions.** The academic studies use 10-120 lab participants. Our system,
if it reaches thousands of users, would produce the LARGEST publicly-documented dataset
of human vs. automated browser behavior.

This alone is publishable — a longitudinal measurement of which signals work and for how
long, across real-world conditions, with sample sizes 10-100x larger than lab studies.

---

## References

1. **FP-Agent** (Wang et al., UC Davis, arXiv 2605.01247, 2026) — AI agent fingerprinting
2. **MARK** (Kang et al., UMass Amherst, arXiv 2606.20910, 2026) — Multi-layer agent fingerprinting
3. **Known By Their Actions** (Lugoloobi et al., Oxford, arXiv 2605.14786, 2026) — LLM agent identification via UI traces
4. **BeCAPTCHA-Mouse** (Acien et al., Pattern Recognition, 2022) — Sigma-Lognormal mouse dynamics
5. **DMTG** (Liu et al., 2024) — Entropy-controlled trajectory generation
6. **IEEE Access** (2026) — Comparative evaluation of mouse dynamics defenses
7. **Wang et al.** (2025) — Approximate Entropy for mouse dynamics authentication
