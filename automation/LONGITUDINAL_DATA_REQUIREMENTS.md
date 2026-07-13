# Longitudinal Study: Data Collection Requirements

## Current Data (Insufficient for Rigorous Longitudinal Analysis)

| Data Point | Collected? | Use for Longitudinal Study |
|------------|:----------:|---------------------------|
| Combined botScore | ✅ | Aggregate trend only — can't decompose |
| Static fingerprints (bucketed) | ✅ | Entropy trends over time |
| Source label | ✅ | Ground truth attribution |
| Timestamp (date) | ✅ | Time series alignment |
| Self-assessment | ✅ | User perception trends |
| **Per-signal scores** | ❌ | **Critical gap — can't track signal half-life** |
| **Raw behavioral sequences** | ❌ | **Critical gap — can't re-analyze with future algorithms** |
| **Browser/OS version** | ✅ Partial | Name only, not version number |
| **Session context** | ❌ | Can't link related submissions |
| **Signal configuration** | ❌ | Don't know which signals were active |
| **Control baselines** | ⚠️ Run manually | Not automatically collected |

## Required Data Schema for Longitudinal Validity

### 1. Per-Signal Scores (NEW — highest priority)

```json
{
  "detectorVersion": 2,
  "signals": {
    "navigator_webdriver": { "weight": 5, "fired": false },
    "automation_frameworks": { "weight": 5, "fired": false, "detail": "playwright" },
    "iframe_webdriver_leak": { "weight": 5, "fired": false },
    "velocity_profile": { "weight": 4, "fired": true, "value": 1.2 },
    "trajectory_optimality": { "weight": 3, "fired": true, "value": 2.1 },
    "mouse_overshoot": { "weight": 3, "fired": false },
    "scroll_pattern": { "weight": 3, "fired": false },
    "paste_detection": { "weight": 3, "fired": false },
    "typing_speed_variance": { "weight": 3, "fired": true, "value": 0.35 },
    "typing_corrections": { "weight": 2, "fired": true, "value": 3 },
    "mouse_speed_variance": { "weight": 4, "fired": true, "value": 0.8 },
    "mouse_curvature": { "weight": 4, "fired": false },
    ...
  },
  "totalBotScore": 48,
  "totalMaxWeight": 95
}
```

**Why this matters:** Enables per-signal half-life analysis. Without it, we can only track the aggregate score, which hides signal-level degradation.

### 2. Raw Behavioral Sequences (NEW — medium priority)

```json
{
  "mouseSequence": [
    {"x": 100, "y": 200, "t": 0},
    {"x": 102, "y": 198, "t": 16}
  ],
  "scrollSequence": [
    {"y": 0, "t": 5000},
    {"y": 300, "t": 5500}
  ],
  "typingIntervals": [120, 95, 340, 110, 85, 450],
  "sensorReadings": [
    {"accelX": 0.1, "accelY": 9.8, "accelZ": 0.2, "t": 1000}
  ]
}
```

**Why this matters:** Future algorithms can re-analyze raw data. Without it, we're locked into our current feature extraction.

### 3. Full Environment Snapshot (NEW — medium priority)

```json
{
  "browserVersion": "126.0.6478.71",
  "osVersion": "Windows NT 10.0",
  "osArchitecture": "Win64",
  "viewportWidth": 1920,
  "viewportHeight": 1080,
  "devicePixelRatio": 1,
  "extensions": ["ublock origin"],
  "networkType": "wifi",
  "networkRTT": 12,
  "timezone": "America/New_York",
  "timezoneOffset": -300
}
```

**Why this matters:** Enables subgroup analysis — does signal effectiveness vary by browser, OS, or network?

### 4. Session Context (NEW — medium priority)

```json
{
  "sessionID": "anon-a1b2c3d4e5f6g7h8",
  "visitNumber": 3,
  "pagesBeforeSubmission": ["fingerprint", "behavior", "webrtc"],
  "timeOnPage": 120000,
  "previousSubmissionHash": "7de99693782d"
}
```

**Why this matters:** Links related submissions for longitudinal tracking without PII.

### 5. Detector Calibration (NEW — high priority)

```json
{
  "detectorVersion": 2,
  "algorithmVersion": "2.0.0",
  "signalConfig": {
    "velocity_profile": {"weight": 4, "threshold": 0.8, "active": true},
    "paste_detection": {"weight": 3, "threshold": 1, "active": true}
  },
  "maxPossibleScore": 95,
  "confidenceThresholds": {"high": 0.5, "medium": 0.25}
}
```

**Why this matters:** Enables comparison across detector versions. Without this, we can't tell if a score change is due to browser change or detector change.

## Statistical Power Requirements

| Analysis | Minimum N | Ideal N | Measurement Points |
|----------|:---------:|:-------:|:------------------:|
| Per-signal AUC-ROC | 50 per group | 200 per group | Monthly |
| Signal half-life | 40 per group | 100 per group | 6+ monthly |
| Trend detection (Cohen's d=0.5) | 64 per group | 128 per group | 5+ time points |
| Change-point detection | 30 per group | 60 per group | Dense around change |
| Template aging rate | 30 browsers | 100 browsers | 3+ visits each |

## Collection Frequency

| Data Type | Collection | Storage |
|-----------|-----------|---------|
| Per-signal scores | Every submission | Blob (structured) |
| Raw behavioral sequences | Every submission (opt-in) | Blob (compressed) |
| Environment snapshot | Every submission | Blob |
| Session context | Per session | Local (hashed) |
| Detector calibration | Per version | Static (committed) |
| Control baselines | Weekly | Blob + Git |

## Implementation Priority

| # | Item | Effort | Impact | Status |
|:-:|------|:------:|:------:|:------:|
| 1 | Per-signal scores in submission | 1 day | 🔴 Critical | 📝 Plan |
| 2 | Detector calibration in submission | 2 hrs | 🔴 Critical | 📝 Plan |
| 3 | Environment snapshot | 4 hrs | 🟡 High | 🟡 Partial (browser, device) |
| 4 | Session context | 2 days | 🟡 High | 📝 Plan |
| 5 | Raw behavioral sequences | 3 days | 🟡 High | 📝 Plan |
| 6 | Automated control baselines | 1 day | 🟡 High | ⚠️ Manual now |
| 7 | Scheduled weekly runs | 1 day | 🟢 Medium | 📝 Plan |
