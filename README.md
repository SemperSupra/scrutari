# Scrutari — Browser Leak Detector

**Scrutari** (Latin: *to search, examine, explore*) is a free, open-source browser privacy leak detector. It runs entirely in your browser — no data leaves your machine.

## Features

| Test | What it detects |
|------|----------------|
| **WebRTC** | Real IP exposure through 4 STUN techniques |
| **Canvas fingerprint** | GPU/hardware rendering differences |
| **WebGL renderer** | Graphics card model and driver |
| **AudioContext** | Audio stack fingerprint |
| **Font enumeration** | 26 installed fonts detected via canvas |
| **Connection type** | Network type, RTT, bandwidth |
| **Timezone / locale** | Location leaks through Intl API |
| **Fingerprint entropy** | How uniquely identifiable your browser is (bits) |

## Usage

**Human:** Open the page in any browser, click buttons.

**Automation:** Add `?format=json&ip=YOUR_EXIT_IP` for machine-readable JSON.

## Compare with trusted tools

Cover Your Tracks (EFF), BrowserLeaks, IPLeak.net, DNSLeakTest, Leakish, PrivacyTests.org

## Repos

- **Private dev:** SemperSupra/scrutari-private
- **Public deploy:** SemperSupra/scrutari (this repo)

## License

Apache 2.0
