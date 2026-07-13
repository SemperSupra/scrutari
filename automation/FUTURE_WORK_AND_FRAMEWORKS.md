# Future Work & Open Source Frameworks

## Client-Side vs Server-Side ML — Decision & Rationale

### Recommendation: Collect client-side, analyze server-side

| Phase | Where | What | Why |
|:-----:|:-----:|------|-----|
| **Now** | Browser | Collect raw behavioral data (mouse, touch, sensor, typing sequences) | Zero latency, no data leaves browser during collection |
| **Next** | Server (Python) | Train ML models on collected data | Full compute, cross-validation, statistical rigor |
| **Future** | Browser (ONNX) | Deploy validated model for real-time feedback | Only after model is proven |

### Data Pipeline

```
Browser (JS)                    Server (Python)              Publication
──────────                     ──────────────              ───────────
Behavioral engine ──→ submissions.jsonl ──→ train_model.py ──→ Model + paper
(collects raw data)   (anonymized export)   (RF/LSTM/Transformer)
```

### Why not client-side ML now?
1. **Model iteration speed**: Server-side retraining takes minutes; browser model updates require deployment
2. **Data access**: Raw sequences enable richer analysis than pre-computed features
3. **Statistical validation**: Cross-validation, holdout sets, and significance tests need full dataset
4. **Browser compatibility**: LiteRT.js/ONNX WebGPU is still emerging (compatibility issues)

---

## Open Source Frameworks to Mine

### Detection Frameworks (What they detect → What we can use)

| Framework | Language | Key Techniques | What We Can Adopt |
|-----------|----------|----------------|--------------------|
| **BotD** (FingerprintJS) | JS | Headless detection, automation framework ID | Their detection list (27 patterns) |
| **StyloBot** | C# | 57 detectors, Markov session vectors | Session-level analysis, timing patterns |
| **Zentinel** | Rust | 4-engine scoring, 0-100 rating | Scoring methodology, known bot DB |
| **bot-mitigation-go** | Go | JS challenge, stealth tool detection | Anubis-like PoW challenge pattern |
| **GhostTrack** | Python | Behavioral analytics, anomaly detection | Scroll/click ratio analysis |

### Evasion Frameworks (What they patch → What we should detect)

| Framework | What It Patches | Our Detection Gap |
|-----------|----------------|-------------------|
| **Camoufox** | C++-level Firefox fingerprint | 🟢 Hard to detect (native code) |
| **CMIFC** | WebGL, canvas, CDP, automation flags | 🟡 We detect some of these |
| **Playwright Stealth** | 31 JS patches (WebDriver, WebGL, canvas, audio) | 🟡 We detect iframe leak, some globals |
| **PyStealth** | CDP detection prevention | 🔴 We don't do CDP detection |
| **godoll** | Bezier mouse, typing typos, physics scroll | 🔴 Our behavioral engine should catch some |

### Key Signals We Should Add (from framework analysis)

| Signal | Found In | Current Status |
|--------|----------|:--------------:|
| `performance.now()` precision reduction | StyloBot, Playwright Stealth | ❌ Not detected |
| Chrome DevTools Protocol (CDP) traces | CMIFC, bot-mitigation-go | ❌ Not detected (server-side) |
| Web Worker consistency checks | Castle.io blog series | ❌ Not detected |
| Missing `sec-ch-ua` headers | Multiple frameworks | ❌ Not detected (HTTP-level) |
| `navigator.pdfViewerEnabled` | Playwright Stealth patches this | ✅ We check this |
| `chrome.runtime` ID patching | Playwright Stealth | ❌ Not detected |
| `navigator.plugins` array content | Camoufox, CMIFC | 🔴 We check length only |
| Screen orientation lock | Multiple | ✅ We detect this |
| AudioContext fingerprint | Multiple stealth frameworks | ✅ We detect Audio |

---

## Framework Comparison Matrix

| Our Signal | BotD | StyloBot | Zentinel | GhostTrack | Camoufox patches |
|------------|:----:|:--------:|:--------:|:----------:|:-----------------:|
| navigator.webdriver | ✅ | ✅ | ✅ | ✅ | ✅ |
| Automation globals | ✅ | ✅ | ✅ | ❌ | ✅ |
| Headless Chrome UA | ✅ | ✅ | ✅ | ✅ | ✅ |
| Canvas fingerprint | ✅ | ❌ | ❌ | ✅ | ✅ |
| WebGL renderer | ✅ | ✅ | ✅ | ❌ | ✅ |
| Mouse behavior | ❌ | ✅ | ❌ | ✅ | ✅ |
| Scroll behavior | ❌ | ✅ | ❌ | ✅ | ✅ |
| Typing analysis | ❌ | ✅ | ❌ | ❌ | ✅ |
| Sensor data | ❌ | ❌ | ❌ | ❌ | ❌ |
| Touch dynamics | ❌ | ❌ | ❌ | ❌ | ❌ |

**Key insight**: Our system is MORE comprehensive than most open-source frameworks in terms of signal diversity. What we lack is:
1. **CDP-level detection** (requires server-side proxy)
2. **Performance API timing analysis** (`performance.now()` precision)
3. **Web Worker consistency checks**
4. **Known bot database** (Zentinel has a maintained list)

---

## Implementation Priorities (from framework analysis)

| Priority | Signal | Source | Effort | Impact |
|:--------:|--------|--------|:------:|:------:|
| **1** | `performance.now()` precision check | StyloBot, Playwright Stealth | 1 hr | Detects headless/automated browsers |
| **2** | Web Worker consistency test | Castle.io | 2 hrs | Catches spoofed properties |
| **3** | Chrome runtime ID check | Playwright Stealth | 1 hr | Detects stealth patches |
| **4** | Plugin content analysis | Camoufox | 2 hrs | Detects stripped/mocked plugins |
| **5** | Known bot User-Agent DB | Zentinel | 1 hr | Classifies known crawlers |

### Adding performance.now() precision check

```javascript
// Headless browsers have reduced precision (100µs vs 5µs)
var precision = 0;
var t1 = performance.now();
for (var pi = 0; pi < 100; pi++) { precision = performance.now() - t1; }
fp['Performance Precision'] = (precision > 0 && precision < 0.01) ? 'Low (headless)' : 'Normal';
```

---

## Future Work Roadmap

### Short-term (v3)
- [x] Performance.now() precision check
- [ ] Web Worker consistency test
- [ ] Chrome runtime ID check
- [ ] Plugin content depth analysis
- [ ] Known bot User-Agent database

### Medium-term (v4)
- [ ] Server-side ML training pipeline (Python)
- [ ] Cross-validation against ground truth labels
- [ ] BotD integration (compare detection rates)
- [ ] Automated baseline runs against StyloBot/Zentinel

### Long-term (v5)
- [ ] Deploy validated model via ONNX Runtime Web
- [ ] CDP-level detection (server-side proxy)
- [ ] Published paper comparing against commercial solutions
- [ ] Open-source our detection methodology

---

---

## Open Research Frameworks to Mine

| Framework | Year | Type | What It Offers | Link |
|-----------|:----:|------|----------------|:----:|
| **XFP-Recognizer** | 2025 | Detection + dataset | Cross-file fingerprinting, 92% accuracy, Alexa Top-10K dataset | [GitHub](https://github.com/Happy-xiaoxi/XFP) |
| **Browsers-Benchmark** | 2025 | Benchmark suite | 20+ automation engines tested against Cloudflare, DataDome, Akamai, reCAPTCHA | [GitHub](https://github.com/techinz/browsers-benchmark) |
| **Cascading Spy Sheets** | 2025 | Research artifact | CSS-based script-less fingerprinting (NDSS 2025) | [GitHub](https://github.com/cispa/cascading-spy-sheets) |
| **LLM Agent Fingerprinting** | 2026 | Dataset + harness | 14 LLM agent traces, 96% F1 identification via UI timings | arXiv 2605.14786 |
| **Browser Fingerprinting Ontology** | 2025 | Ontology + scripts | Machine-readable fingerprinting model | [GitHub](https://github.com/cdmcdermott/Research) |

## Open Behavioral Biometrics Datasets for ML Pre-training

| Dataset | Size | Signals | Access | Use for us |
|---------|:----:|---------|:------:|------------|
| **SapiMouse** | 120 users, CSV | Mouse (x,y,t), button state | [Direct download](http://www.ms.sapientia.ro/~manyi/sapimouse/sapimouse.zip) | Pre-train mouse dynamics classifier |
| **Balabit** | 10 users, CSV | Mouse sessions | [GitHub](https://github.com/balabit/Mouse-Dynamics-Challenge) | Benchmark our behavioral engine |
| **DELBOT-Mouse** | Labeled human/bot | Mouse (x,y,t), screen res | [GitHub](https://github.com/chrisgdt/DELBOT-Mouse) | Train bot vs human classifier |
| **BB-MAS** | 1.7M swipes, 117 users | Touch + accelerometer + gyroscope | GitHub | Pre-train mobile touch model |
| **BOT1/BOT2** | Human + bot | 150+ mouse features | DOI: 10.21293/1818-0442-2024-27-3-118-124 | Human/bot classification benchmark |
| **HMOG** | 100 users | Touch + sensors | Request | Mobile behavioral authentication |
| **Credibility Dataset** | Multiple | Mouse + hardware info | [GitHub](https://github.com/micemicsresearch/mouse-dynamics-data-credibility) | Hardware effect correction |

### Key Insight for Our ML Pipeline

Research consistently shows that **Random Forest with 20-30 well-chosen features achieves 90-95% accuracy** for mouse dynamics classification. The SapiMouse and DELBOT-Mouse datasets are sufficient to pre-train a model that we can then fine-tune on our own data.

**Recommended approach:**
1. Download SapiMouse + DELBOT-Mouse
2. Extract the same features our behavioral engine computes (velocity, curvature, pauses, overshoot)
3. Train a Random Forest classifier
4. Test against our human simulation baseline (should detect 64% bot)
5. Fine-tune on our own labeled submissions when N≥100

### Pre-trained Models Available

No public pre-trained models for browser bot detection exist yet. This is a gap we could fill by publishing our trained model alongside any research paper.

## References

1. **BotD** — https://github.com/fingerprintjs/botd
2. **StyloBot** — https://github.com/scottgal/stylobot
3. **Zentinel** — https://github.com/zentinelproxy/zentinel-agent-bot-management
4. **CMIFC** — https://github.com/VolkanSah/CMIFC
5. **Camoufox** — https://github.com/leetesla/camoufox-firefox-crawler-browser
6. **Playwright Stealth** — https://github.com/managedcode/playwright_stealth
7. **GhostTrack** — https://github.com/CyberbyKayvon/GhostTrack-Analytics
8. **Castle.io Blog Series** — https://blog.castle.io/
9. **bot-mitigation-go** — https://github.com/fxoz/bot-mitigation-go
