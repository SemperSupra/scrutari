# Bot-or-Not Detector Changelog

Tracks methodology changes over time. Each version bump means the detection
algorithm changed, which may affect cross-version score comparability.
Submit `detectorVersion` with every data submission for longitudinal analysis.

## Version 1 — 2026-07-12

**Initial research-grade detector.**

### Static fingerprint signals (36 total):
- WebDriver flag, iframe leak, automation framework globals (Playwright, Selenium, Puppeteer)
- Canvas, WebGL, AudioContext, font enumeration
- timezone/language alignment, screen resolution, device memory
- CSS engine probes (Houdini, :has(), container queries)
- IPv6 connectivity, DNS features, IP version
- localStorage, cookies, Service Worker, WebUSB, Bluetooth, Serial
- Frame detection, GPC, DNT, cross-origin isolation, extension DOM traces
- Ad tech detection (GPT, GA, GTM, Facebook Pixel)
- Installed Related Apps API (Chrome)

### Behavioral signals (82 max weight):
- Mouse: speed variance, path curvature, pause frequency, avg speed
- Scroll: reading pauses, direction changes
- Click: time to first interaction
- Keyboard: speed variance, presence
- Form: typing hesitation, corrections (backspace), natural typing speed, multi-field nav, field re-visit
- Honeypot: hidden field fill, decoy button clicks, extra button clicks
- Challenge form: email format, email confirmation match, password match, date format, confirmation hesitation, spellcheck, form interaction count
- Pattern-of-life: zoom changes, page navigation, tab order, zoom level
- Window: tab switches, resize
- Page timing: navigation type, load time

### Anti-detection countermeasures:
- Generic IDs (no "honeypot" or "bot" patterns)
- CSS clip instead of left:-9999px for hidden fields
- Passive event listeners
- No "recording" text (uses "Active")
- Decoy buttons labeled as UI controls

### Known limitations:
- Joint entropy not yet calculated (marginal only — overestimates by ~30%)
- No longitudinal data yet (needs 3+ months of submissions)
- Self-selection bias (only privacy-conscious users submit)
- Stealth browsers (Tor, Brave) may trigger false positives on some signals
