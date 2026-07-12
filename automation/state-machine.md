# Scrutari UI/UX State Machine

## States

```
┌─────────────────────────────────────────────────────┐
│                      LANDING                         │
│  Initial page load. No tests run yet.               │
│  All sections visible, no results.                  │
├─────────────────────────────────────────────────────┤
│  ↓ navigateTo('section-exit-node')                  │
├─────────────────────────────────────────────────────┤
│                   NETWORK_ANALYSIS                   │
│  GeoIP lookup available.                            │
│  Transitions: classify, detectMyIP, analyzeExitNode │
├─────────────────────────────────────────────────────┤
│  ↓ navigateTo('section-fingerprint')                  │
├─────────────────────────────────────────────────────┤
│              FINGERPRINT_CAPTURING                   │
│  captureFingerprint() running (async).              │
│  PoW benchmark, WebGL, canvas, audio in progress.   │
├─────────────────────────────────────────────────────┤
│  ↓ [async complete ~5s]                             │
├─────────────────────────────────────────────────────┤
│               FINGERPRINT_COMPLETE                   │
│  Fingerprint grid visible.                          │
│  Bot-or-Not gauge rendered with score.              │
│  Share buttons available.                           │
│  Entropy score displayed.                           │
├─────────────────────────────────────────────────────┤
│  ↓ navigateTo('section-webrtc')                      │
├─────────────────────────────────────────────────────┤
│                    WEBRTC_TESTING                    │
│  runWebRTCTests() running (async).                  │
│  IPv4 + IPv6 candidates collected.                  │
├─────────────────────────────────────────────────────┤
│  ↓ [async complete]                                 │
├─────────────────────────────────────────────────────┤
│                   WEBRTC_COMPLETE                    │
│  STUN results table visible.                        │
│  IPv4/IPv6 addresses shown. Leak status.            │
├─────────────────────────────────────────────────────┤
│  ↓ navigateTo('section-behavior')                    │
├─────────────────────────────────────────────────────┤
│               BEHAVIOR_IDLE                          │
│  'Start analysis' button visible.                   │
│  Decoy buttons, challenge form visible (dimmed).    │
├─────────────────────────────────────────────────────┤
│  ↓ toggleBehaviorRecording()                        │
├─────────────────────────────────────────────────────┤
│              BEHAVIOR_RECORDING                      │
│  Mouse, scroll, click, key tracking active.         │
│  Progress bar counting down from 15s.               │
│  Test area highlighted (opacity: 1).                │
│  Real-time signal indicators updating.              │
├─────────────────────────────────────────────────────┤
│  ↓ [timeout 15s OR toggleBehaviorRecording()]       │
├─────────────────────────────────────────────────────┤
│               BEHAVIOR_COMPLETE                      │
│  Behavioral score gauge rendered.                   │
│  Signal breakdown available (collapsible).          │
├─────────────────────────────────────────────────────┤
│  ↓ navigateTo('section-botornot')                    │
├─────────────────────────────────────────────────────┤
│                  RESULTS_OVERVIEW                    │
│  Bot-or-Not + Behavioral scores visible.            │
│  Share buttons available. Download card ready.      │
├─────────────────────────────────────────────────────┤
│  ↓ [fingerprint exists] enableSubmission()          │
├─────────────────────────────────────────────────────┤
│               SUBMISSION_READY                       │
│  'Contribute to Research' section active.           │
│  Data preview rendered. Consent checkbox shown.     │
├─────────────────────────────────────────────────────┤
│  ↓ check consent → click submit                    │
├─────────────────────────────────────────────────────┤
│               SUBMISSION_SENDING                     │
│  POST to /api/submit in progress.                   │
├─────────────────────────────────────────────────────┤
│  ↓ [success]                                        │
├─────────────────────────────────────────────────────┤
│               SUBMISSION_SENT                        │
│  'Thank you' message displayed.                     │
│  Research stats visible (total, unique, dedup).     │
└─────────────────────────────────────────────────────┘
```

## Transition Matrix

### Valid Transitions (Human-like Flow)

| From | To | Trigger | Expected |
|------|-----|---------|----------|
| LANDING | NETWORK_ANALYSIS | Click wizard nav button | Smooth scroll, hash updated |
| NETWORK_ANALYSIS | FINGERPRINT_CAPTURING | Click '2. Fingerprint' nav | Fingerprint section visible |
| FINGERPRINT_CAPTURING | FINGERPRINT_COMPLETE | Async completion (~5s) | Grid + gauge rendered |
| FINGERPRINT_COMPLETE | WEBRTC_TESTING | Click 'Test WebRTC' | STUN requests initiated |
| FINGERPRINT_COMPLETE | SUBMISSION_READY | enableSubmission() fires | Submit section activated |
| WEBRTC_TESTING | WEBRTC_COMPLETE | Async completion (~3s) | Table with results |
| BEHAVIOR_IDLE | BEHAVIOR_RECORDING | Click 'Start analysis' | Progress bar, tracking active |
| BEHAVIOR_RECORDING | BEHAVIOR_COMPLETE | Auto-stop (15s) or manual stop | Score gauge rendered |
| BEHAVIOR_COMPLETE | RESULTS_OVERVIEW | Navigate to Bot-or-Not section | Both scores visible |
| SUBMISSION_READY | SUBMISSION_SENDING | Check consent + click Submit | POST request sent |
| SUBMISSION_SENDING | SUBMISSION_SENT | API response 200 | Thank you message |

### Invalid Transitions (Bot-like / Unexpected)

| From | Attempt To | What SHOULD happen | What COULD happen |
|------|-----------|-------------------|-------------------|
| LANDING | SUBMISSION_SENT | Nothing (no fingerprint data) | Submission fails silently |
| LANDING | BEHAVIOR_RECORDING | OK (can record anytime) | Valid — tracking works anytime |
| BEHAVIOR_IDLE | BEHAVIOR_COMPLETE (skip recording) | Nothing — requires recording | No data to analyze |
| Any | Multiple simultaneous BEHAVIOR_RECORDING | Start stops existing, or ignored | toggle is toggle |
| SUBMISSION_SENT | SUBMISSION_SENT (again) | Sends same data again | API deduplicates |
| FINGERPRINT_CAPTURING | FINGERPRINT_CAPTURING (restart) | Overwrites previous results | OK — fresh capture |
| BEHAVIOR_RECORDING | FINGERPRINT_CAPTURING | Continues in parallel | Both track simultaneously |
| LANDING | SUBMISSION (click submit button directly) | No consent checkbox rendered | Button disabled until consent |

### Sequential Wizard Flow (Expected Human Behavior)

```
 1. Network  →  2. Fingerprint  →  3. WebRTC  →  4. Behavior  →  5. Results
 [exit-node]    [capture + bon]    [webrtc test]  [record + analyze]  [scores + share]
```

A human user is expected to navigate these in order. The wizard progress bar tracks:
- **Gray** = not visited
- **Blue** = current page  
- **Green** = completed

## Bot Detection Opportunities via State Machine

| Bot behavior | Detection method |
|-------------|-----------------|
| Navigates pages out of order (e.g., jumps to 5 before 2) | `pageNav` event sequence analysis |
| Never navigates (stays on one section) | Missing `pageNav` events entirely |
| Submits without fingerprint data | API validation rejects (missing version/source) |
| Starts behavioral recording but never interacts | 0 mouse events, 0 scroll events |
| Clicks decoy/honeypot buttons | `formClicks` event with decoy IDs |
| Fills hidden field (`input-ext`) | `input` event with `input-ext` ID |
| Clicks share before fingerprint | No fingerprint data → silent failure |
| Completes entire wizard in < 1 second | Unnatural timing — no human reading pauses |
