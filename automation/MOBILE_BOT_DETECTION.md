# Mobile Bot Detection: Interaction Models, Research & Implementation Strategy

## 1. How Mobile Differs from Desktop

### Interaction Modalities

| Modality | Desktop | Mobile | Bot Equivalents |
|----------|---------|--------|-----------------|
| **Primary input** | Mouse (x,y,t) | Touch (x,y,t,pressure,area) | Appium, Espresso, XCUITest |
| **Scroll** | Wheel + click-drag | Swipe (velocity, deceleration) | Programmatic scrollTo |
| **Zoom** | Ctrl+wheel | Pinch (multi-touch) | Rarely simulated |
| **Rotation** | N/A | Device orientation | Emulator spoofing |
| **Keyboard** | Physical (predictable) | Virtual (varies by keyboard app) | ADB input, UI Automator |
| **Sensors** | None accessible | Accelerometer, gyroscope, magnetometer | Sensor mocking frameworks |
| **Viewport** | Fixed window | Dynamic (rotate, split screen) | Standardized emulator sizes |

### What We Currently Miss

Our entire SPA is designed for desktop mouse/keyboard interaction. On mobile:
- No `mousemove` events (touch uses `touchmove`)
- No `mousedown`/`mouseup` (touch uses `touchstart`/`touchend`)
- No hover states
- Different scroll behavior (inertia scrolling)
- No right-click
- Touch pressure and area available but not captured

**Fundamental gap**: A mobile user visiting Scrutari generates ZERO behavioral signals from our current engine because we only track `mousemove` and `click` events.

---

## 2. Mobile-Specific Bot Detection Signals

### Touch Dynamics (Already Research-Proven)

| Signal | Description | Research Support | Accuracy |
|--------|-------------|-----------------|:--------:|
| **Swipe velocity** | Speed of finger movement during scroll/swipe | SwipeFormer (2024), BB-MAS dataset | 93-96% |
| **Touch pressure** | Force applied during tap/swipe | Touch Dynamics Review (2025) | 85-90% |
| **Touch area** | Finger contact surface (varies by user) | Continuous Auth Survey (2025) | 80-85% |
| **Swipe curvature** | Arc vs straight-line swipe paths | SwipeFormer (2024) | 90-95% |
| **Inter-tap interval** | Time between consecutive taps | XGBoost-LSTM (2025) | 88-92% |
| **Scroll deceleration** | Natural vs programmatic scroll decay | FP-Agent methodologies | 85-90% |
| **Multi-touch patterns** | Pinch-zoom, rotation gestures | Rarely simulated by bots | 95%+ |

### Sensor-Based Signals

| Signal | What It Detects | Research | Accuracy |
|--------|-----------------|----------|:--------:|
| **Accelerometer noise** | Real device vs emulator (sensor noise fingerprint) | SwipeFormer (2024), Delgado-Santos thesis | 94-98% |
| **Gyroscope drift** | Hardware imperfections identify specific device | Gyroscope WaveNet (2024) | 90-95% |
| **Magnetometer** | Environmental magnetic field (unique per location) | Sensor Fusion (2024) | 85-90% |
| **Sensor timing** | Real sensors vs mocked/faked sensor data | Baidu Cloud anti-bot (2025) | 90-95% |

### Emulator/VM Detection

| Signal | What It Detects | Reliability |
|--------|-----------------|:-----------:|
| **WebAssembly fingerprint** | Chromium browser variants (even with spoofed UA) | <1% FPR |
| **Canvas/WebGL mismatches** | GPU virtualization vs claimed device | High |
| **Screen resolution** | Standardized emulator sizes (1080x1920, 1440x2560) | Medium |
| **Font enumeration** | Emulator font sets differ from real devices | Medium |
| **Sensor API availability** | Emulators may not expose real sensors | High |
| **Touch API consistency** | maxTouchPoints, touch event behavior | Medium |

---

## 3. Existing Research (2024-2026)

### Key Papers by Venue

| Paper | Venue | Year | Method | Results |
|-------|-------|:----:|--------|:-------:|
| **SwipeFormer** | Expert Systems with Applications | 2024 | Transformer on swipe + IMU data | 3.6% EER (iOS) |
| **XGBoost-LSTM Hybrid** | IEEE | 2025 | Hybrid model with drift adaptation | 26-37% EER reduction |
| **Touch Dynamics Review** | ICECET | 2025 | Comprehensive ML algorithm comparison | 90%+ accuracy |
| **Swipe Dynamics RF** | GitHub (BB-MAS dataset) | 2025 | Random Forest, 23 features | 99.7% accuracy |
| **MotionID** | Pervasive & Mobile Computing | 2024 | Practical deployment study | 98.5% F1 |
| **Sensor Fusion + TOPSIS** | MDPI J. Cybersecurity | 2025 | Multi-criteria feature ranking | 95.2% accuracy |
| **Drag-and-Drop Bot Detection** | Zenodo | 2025 | Touch + accelerometer fusion | Novel method |

### Available Datasets

| Dataset | Size | Signals | Public? |
|---------|:----:|---------|:-------:|
| **BB-MAS** | 1.7M swipes, 117 users | Touch + accelerometer + gyroscope | ✅ Yes |
| **HMOG** | 100 users | Touch + sensors | ✅ Yes |
| **TVAN** | 50 users | Touch gestures | ✅ Yes |
| **UTTouch** | 100 users | Touch dynamics | ✅ Yes |

### Key Finding for Our Use Case

Research consistently shows that **Random Forest with 20-30 well-chosen features achieves 90-95% accuracy** for touch-based classification. Deep learning (Transformers, LSTM) improves this to 95-99% but requires more data and compute. **For our initial implementation, Random Forest on touch features is the pragmatic choice.**

---

## 4. Framework Options for Mobile ML

| Framework | Mobile Inference | Web Inference | Model Format | Recommendation |
|-----------|:----------------:|:-------------:|--------------|:--------------|
| **TensorFlow Lite** | ✅ Native (Android/iOS) | ❌ | .tflite | **Best for mobile-native deployment** |
| **LiteRT.js** | ❌ | ✅ (WebGPU/WASM) | .tflite | Good if deploying to mobile web |
| **ONNX Runtime** | ✅ Native | ✅ (WebGPU) | .onnx | Cross-platform, most flexible |
| **Core ML** (Apple) | ✅ iOS only | ❌ | .mlmodel | iOS-specific optimization |
| **ML Kit** (Google) | ✅ Android only | ❌ | .tflite | Android-specific optimization |

### Our Recommendation

**For mobile data collection**: Enhance the SPA with touch event tracking (touchstart, touchmove, touchend) — this works on ALL mobile browsers without any framework.

**For ML model deployment**: Train with TensorFlow, convert to ONNX, deploy via ONNX Runtime Web. This gives us:
- Same model format for web and native
- Cross-platform compatibility
- WebGPU acceleration when available
- CPU fallback (WASM) when not

---

## 5. Mobile Automation Detection

### Appium-Specific Signals

Appium (the most common mobile automation framework) leaves detectable traces:
- **`android.webkit.WebView`** — JavaScript interface injection detectable via `window` object
- **`Appium` string in User-Agent** — some WebView configurations expose it
- **`navigator.webdriver`** — set to `true` in Appium's ChromeDriver (same as desktop Selenium)
- **`window.navigator.appium`** — sometimes exposed in the global scope
- **Touch event timing** — programmatic touches have zero-duration; human touches have 50-200ms duration
- **No accelerometer data** — Appium doesn't mock sensor data unless explicitly configured

### Emulator Detection Signals

| Emulator | Detectable By |
|----------|--------------|
| **Android Studio Emulator** | Build properties, specific MAC prefix, QEMU drivers |
| **Bluestacks** | Specific user-agent, display density, process list |
| **Genymotion** | Specific GPU renderer, MAC prefix |
| **iOS Simulator** | x86_64 architecture on "iOS" device (impossible on real hardware) |
| **BrowserStack / Sauce Labs** | Known IP ranges, specific port behavior |

---

## 6. Implementation Strategy

### Phase 1: Mobile Touch Tracking (Week 1)
Add touch event listeners to the SPA: `touchstart`, `touchmove`, `touchend`, `gesturechange`
```javascript
function __trackTouch(e) {
  var touch = e.touches ? e.touches[0] : e.changedTouches[0];
  __behavior.events.touch.push({
    x: touch.clientX, y: touch.clientY,
    t: performance.now(), type: e.type,
    force: touch.force || null,  // touch pressure
    radius: touch.radiusX || null
  });
}
```

### Phase 2: Mobile Sensor Access (Week 2)
Request accelerometer/gyroscope access via `DeviceMotionEvent` API
```javascript
window.addEventListener('devicemotion', function(e) {
  __behavior.events.motion.push({
    accel: e.accelerationIncludingGravity,
    rot: e.rotationRate,
    t: performance.now()
  });
});
```

### Phase 3: Mobile Bot Classification (Week 3)
Extract touch features and add as Bot-or-Not signals:
- Swipe velocity and curvature (analogous to mouse signals)
- Touch duration (bots have instant touch, humans vary)
- Inter-tap intervals
- Multi-touch capability (bots rarely simulate multi-touch)
- Emulator detection signals

### Phase 4: ML Model (Month 2+)
Train a classifier using existing datasets (BB-MAS, HMOG) and our collected data:
1. Export touch data from SPA
2. Train Random Forest classifier (baseline)
3. Compare with Transformer/LSTM
4. Deploy via ONNX Runtime Web

---

## 7. Current Status & Recommendations

| Capability | Status | Priority |
|------------|:------:|:--------:|
| Desktop mouse tracking | ✅ Built (w4-w1 signals) | Done |
| Desktop scroll tracking | ✅ Built (w3 signals) | Done |
| Desktop typing tracking | ✅ Built (w3 signals) | Done |
| Desktop keyboard tracking | ✅ Built (w1 signals) | Done |
| **Mobile touch tracking** | ❌ Not implemented | **🔴 High** |
| **Mobile sensor access** | ❌ Not implemented | 🟡 Medium |
| **Mobile emulator detection** | ❌ Not implemented | 🟡 Medium |
| **Mobile bot classification** | ❌ Not implemented | 🟡 Medium |
| **Cross-platform ML model** | ❌ Not implemented | 🟢 Low |

### Recommendation

**Start with Phase 1 (touch tracking)** — it's ~50 lines of JS and immediately enables mobile data collection. Mobile users currently generate zero behavioral signals; adding touch tracking gives us the data to build mobile-specific bot detection.

**Reference**: iOS Safari and Chrome for Android both support `TouchEvent` with `force` (pressure) and `radiusX`/`radiusY` (touch area). These are available without any permissions prompt.

### References

1. SwipeFormer: Transformers for Mobile Touchscreen Biometrics. Expert Systems with Applications, 2024.
2. Hybrid XGBoost-LSTM for Touch Behavior Biometrics. IEEE, 2025.
3. Touch Dynamics Review. ICECET, 2025.
4. Swipe Dynamics RF (BB-MAS). GitHub, 2025.
5. MotionID. Pervasive and Mobile Computing, 2024.
6. Sensor Fusion + TOPSIS. MDPI J. Cybersecurity, 2025.
7. Browser Fingerprinting Using WebAssembly. arXiv 2506.00719, 2025.
8. GeeTest Device Fingerprinting Documentation, 2025.
9. IPQS Emulator Detection Guide, 2025.
10. Baidu Cloud Anti-Bot Guide, 2025.
