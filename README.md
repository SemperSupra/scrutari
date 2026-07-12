# Scrutari — Browser Leak Detector

**🌐 Live site:** https://scrutari-submit-1783887159.netlify.app/
**📖 GitHub Pages:** https://sempersupra.github.io/scrutari/

**Scrutari** (Latin: *to search, examine, explore*) is a free, open-source browser privacy leak detector. It runs entirely in your browser — no data leaves your machine.

## Features

| Test | What it detects |
|------|----------------|
| **Bot-or-Not™** | 25-signal analysis scoring how human-like vs bot-like your browser appears |
| **WebRTC** | Real IP exposure through 4 STUN techniques |
| **Canvas fingerprint** | GPU/hardware rendering differences |
| **WebGL renderer** | Graphics card model and driver |
| **AudioContext** | Audio stack fingerprint |
| **Font enumeration** | 26 installed fonts detected via canvas |
| **Connection type** | Network type, RTT, bandwidth |
| **Timezone / locale** | Location leaks through Intl API |
| **Fingerprint entropy** | How uniquely identifiable your browser is (bits) |
| **Automation detection** | Scans for Playwright, Selenium, Puppeteer, CDP signals |
| **PoW benchmark** | SHA-256 hash rate reveals CPU engine differences |

## Usage

**Human:** Open the page in any browser, click buttons.

**Automation:** Add `?format=json&ip=YOUR_EXIT_IP` for machine-readable JSON.

## Compare with trusted tools

Cover Your Tracks (EFF), BrowserLeaks, IPLeak.net, DNSLeakTest, Leakish, PrivacyTests.org

## Bot-or-Not™

The **Bot-or-Not** rating analyzes 25 browser signals to estimate how human-like vs bot-like your connection appears. Results show a percentage score with confidence level and a detailed signal breakdown.

**Signals scored:** WebDriver flags, automation frameworks (Playwright, Selenium, Puppeteer), iframe webdriver leaks, WebGL software renderers, font enumeration, Canvas/AudioContext availability, screen resolution anomalies, timezone/language alignment, device memory, PoW timing, CPU core count, and more.

## Research references

The fingerprint entropy model and Bot-or-Not signals are backed by published research:

| Study | Year | Key finding |
|-------|------|-------------|
| Eckersley, "How Unique Is Your Web Browser?" (PETS) | 2010 | Average browser: 18.1 bits entropy, 1 in ~286K unique |
| Bacis et al., "Assessing Web Fingerprinting Risk" (WWW) | 2024 | 5,383 Web API surfaces; Chow-Liu entropy with correlation |
| Andriamilanto et al., "FP-STALKER" | 2021 | 81% of fingerprints unique across 216 attributes, 2M visitors |
| Boussaha et al., "FP-tracer" (PoPETs) | 2024 | Entropy-based thresholds for fingerprinting classification |
| Vastel et al., "FP-Crawlers" | 2017 | Headless browser fingerprint detection methodology |
| DataDome / Castle.io (industry) | 2024-2025 | CDP serialization, iframe webdriver leaks, anti-detect frameworks |

**Key insight:** Entropy measures uniqueness; Bot-or-Not measures human-likeness. A Tor Browser user has high entropy (rare fingerprint) but looks very human. A headless scraper using defaults has low entropy (common) but looks like a bot.

- **Private dev:** SemperSupra/scrutari-private
- **Public deploy:** SemperSupra/scrutari (this repo)

## License

Apache 2.0
