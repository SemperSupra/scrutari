# Client Trust Methodology: Measuring the Untrusted Client

**Date:** 2026-07-15
**Status:** Living document — updated as countermeasures evolve

---

## 1. The Core Problem

We collect browser fingerprint data by asking the browser to report on itself.
The browser (or the entity controlling it) can lie about any signal.

```
┌──────────────────────────────────────────────────────────────┐
│                    ATTACKER CAPABILITIES                      │
│                                                              │
│  Signal              │  Can fake? │  How                      │
│──────────────────────┼────────────┼──────────────────────────│
│  navigator.webdriver │  ✅ Yes   │  Puppeteer stealth plugin │
│  Canvas hash         │  ✅ Yes   │  Patch canvas API         │
│  navigator.platform  │  ✅ Yes   │  --user-agent flag         │
│  Screen resolution   │  ✅ Yes   │  Set window size           │
│  Font enumeration    │  ✅ Yes   │  Patch font API            │
│  Mouse movements     │  ✅ Yes   │  AI-generated trajectories │
│  PoW timing          │  🟡 Part  │  Report false time         │
│  PoW nonce           │  ❌ No    │  Must compute SHA-256      │
│  TLS fingerprint     │  ❌ No    │  Server-observed           │
│  HTTP headers        │  ❌ No    │  Server-observed           │
│  Network RTT         │  ❌ No    │  Server-observed           │
└──────────────────────────────────────────────────────────────┘
```

**Key insight:** The server-verified PoW nonce is the ONLY signal the client
cannot fake. Everything else is self-reported and can be spoofed.

---

## 2. What We Can Verify Server-Side

### 2.1 PoW Proof (Cryptographically Verifiable)

```
Challenge: Server generates random 32 bytes → "a1b2c3d4..."
Proof:     Client must find nonce where SHA256(challenge + nonce)
           has ≥ N leading zero bits
Verify:    Server recomputes SHA256(challenge + claimed_nonce)
           and checks the bit count. This is O(1), not O(N).
```

The PoW proof is our **ground truth anchor**. It proves:
- The client executed JavaScript (or equivalent computational engine)
- The client expended real CPU time (proportional to difficulty)
- The client cannot have pre-computed this (challenge is fresh per request)

**What the client CAN still fake about PoW:**
- The reported timing (we measure wall-clock on our end approximately,
  but can't measure client-side timing precisely)
- The reported difficulty (we issue it, so we know)

### 2.2 TLS/JA4 Fingerprint (Protocol-Level)

Observed by the CDN edge before the request reaches our application.
Cannot be spoofed by client-side JavaScript. Identifies:
- Browser family (Chrome BoringSSL vs Firefox NSS vs Go net/http)
- TLS library version
- Cipher suite preferences

### 2.3 HTTP/2 and HTTP/3 Parameters

Connection-level parameters visible to the server:
- SETTINGS frame order and values
- WINDOW_UPDATE patterns
- Flow control behavior

### 2.4 Network Timing

- Request arrival time → server processing time → response time
- RTT estimation (coarse, but server-side measurable)
- Rate of requests from same IP

### 2.5 IP Geolocation and Reputation

- ASN, country, city (from CDN)
- Known VPN/datacenter/Tor exit detection
- IP-based rate limiting

---

## 3. Consistency Analysis: The Core Methodology

Since most signals are self-reported, we detect deception through
**cross-signal consistency analysis**:

```
┌─────────────────────────────────────────────────────────────┐
│                  CONSISTENCY MATRIX                          │
│                                                              │
│  Signal Pair                │  Expected Relationship          │
│─────────────────────────────┼────────────────────────────────│
│  CPU cores vs PoW speed    │  More cores → faster PoW       │
│  Device memory vs PoW speed│  More RAM → slightly faster    │
│  Platform vs PoW speed     │  ARM ~0.7x, x64 ~1.0x         │
│  Reported UA vs platform   │  macOS UA → MacIntel/ARM64     │
│  Screen res vs GPU         │  4K display → high-end GPU     │
│  Canvas vs WebGL renderer  │  Consistent GPU driver string  │
│  Font count vs OS          │  macOS has more fonts than Win │
│  Language vs timezone      │  en-US → America/* timezone    │
│  Behavioral events vs time │  More time → more events       │
│  Session ID vs fingerprint │  Same ID → same hardware       │
│  PoW difficulty vs time    │  Higher bits → longer compute   │
│  PoW time vs benchmark     │  Should be correlated (r > 0.7)│
│  Battery vs CPU (future)   │  On battery → slower CPU       │
└─────────────────────────────────────────────────────────────┘
```

Each consistency check produces a score. The aggregate is the
**Client Trust Score** (0-100):

- **90-100**: All signals consistent. High trust.
- **70-89**: Minor inconsistencies (acceptable variance).
- **40-69**: Suspicious — multiple inconsistencies.
- **0-39**: Likely spoofed — fundamental signals contradict each other.

### Example: Spoofed High-End Browser on Low-End Hardware

```
Claimed: macOS 14, 16 cores, 32GB RAM, Chrome 126
Detected PoW time: 3200ms (implies ~15K hashes/sec)
Expected PoW time: ~22ms (for 16c/32GB/ARM)

Anomaly ratio: 3200/22 = 145x → CRITICAL
Analysis: Hardware profile and PoW speed are fundamentally inconsistent.
Likely: Headless browser on a low-end VM reporting fake UA/hardware.

Client Trust Score: 15/100
```

---

## 4. Remediation Strategy

### 4.1 Signal Hardening (Make Spoofing Harder)

| Signal | Hardening | Status |
|--------|-----------|--------|
| PoW timing | Measure BOTH client-reported AND server-wall-clock | 🟡 Server wall-clock is approximate but acts as sanity check |
| Canvas | Compare WebGL renderer string vs canvas hash consistency | 🟡 Collecting both, not yet correlated |
| Platform | Check UA vs navigator.platform vs navigator.userAgentData | 🟢 Collecting all three |
| Screen | Compare screen resolution vs window.innerWidth/Height | 🟢 Already collected |
| Fonts | Cross-reference font count with expected count for reported OS | 🔴 Not yet implemented |

### 4.2 Statistical Detection (Find the Anomalies)

Implemented in the PoW timing model:
```python
anomaly_ratio = actual_time / expected_time
if anomaly_ratio > 3:      # Too slow → VM/container
    trust_score -= 20
if anomaly_ratio < 0.3:    # Too fast → accelerator
    trust_score -= 30
```

### 4.3 Longitudinal Consistency (Track Across Visits)

Using sessionID to link submissions from the same browser:

```
Visit 1: PoW Speed = 100K hps, Platform = MacIntel, Cores = 8
Visit 2: PoW Speed = 95K hps, Platform = MacIntel, Cores = 8
  → Consistent. Trust maintained.

Visit 1: PoW Speed = 100K hps, Platform = MacIntel, Cores = 8
Visit 2: PoW Speed = 10K hps, Platform = Linux, Cores = 2
  → INCONSISTENT. Environment changed. Possible VM migration.
```

**Implementation gap:** This analysis exists in the data but no automated
alerting. We need a "fingerprint drift detector."

### 4.4 Honeypot Verification (Catch Automated Clients)

Already implemented:
- Hidden fields that bots fill but humans ignore
- Decoy buttons that bots click but humans skip
- LLM injection comments visible to scrapers
- Tarpit content that engages crawlers

These are our **canary signals** — if they fire, the client is very likely
automated regardless of what other signals report.

---

## 5. Research Methodology Implications

### 5.1 What We Can Actually Measure

| Claim | Can We Measure It? | Confidence |
|-------|:------------------:|:----------:|
| "This browser has fingerprint X" | 🟡 Self-reported | Low-Medium |
| "This browser computed PoW" | ✅ Server-verified | High |
| "This TLS connection is from Chrome 126" | 🟡 JA4 + UA correlation | Medium |
| "This IP is residential" | 🟡 ASN-based classification | Medium |
| "This client is human" | 🟡 Aggregate of weak signals | Low |

### 5.2 What We Should Report in Research

Our publications must acknowledge:

> "All client-side signals are self-reported and may be spoofed by
> sophisticated adversaries. The PoW proof provides cryptographic
> evidence of computation but does not guarantee authenticity of
> any other signal. Our findings should be interpreted as:
> (1) measurements of what browsers report, not what they are;
> (2) comparisons of signal distributions, not absolute truths;
> (3) lower bounds on detection rates, not upper bounds."

### 5.3 Recommended Citation

> "Scrutari Methodology: Client-Side Browser Measurement with
> Server-Verified Proof-of-Work." SemperSupra, 2026.
> https://github.com/SemperSupra/scrutari

---

## 6. Action Items

| # | Item | Impact | Effort | Decision |
|:-:|------|:------:|:------:|:--------:|
| 1 | **Cross-signal consistency matrix in analysis dashboard** | High | 2 days | **Implement** |
| 2 | **Client Trust Score computation in analysis API** | High | 1 day | **Implement** |
| 3 | **Longitudinal fingerprint drift detector** | Medium | 2 days | **Defer** |
| 4 | **PoW timing vs hardware profile visualization** | Medium | 1 day | **Implement** |
| 5 | **Adversarial validation: inject known-bot traces** | High | 1 day | **Implement** |
| 6 | **Server-wall-clock PoW timing as sanity check** | Medium | 4 hrs | **Defer** |
