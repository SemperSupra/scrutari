# IPv6 Probe Reliability Experiment

## Problem

The current `probeIPv6Connectivity()` in `index.html:2044` uses a single endpoint
(`https://ipv6.test-ipv6.com/`) with `no-cors` mode and a 3s timeout. This has
known failure modes:

1. **False negatives:** If test-ipv6.com is down or slow, the system reports "no
   IPv6" even on IPv6-capable networks
2. **False positives:** `no-cors` mode succeeds on any HTTP response (including 404
   and redirects), so DNS resolution alone can trigger a "success"
3. **No IPv4 control:** Cannot distinguish "IPv6 blocked" from "both v4 and v6 blocked"
4. **Single point of failure:** No retry, no alternative

## Hypothesis

Multi-endpoint probing with 2/3 consensus reduces false negatives without
increasing false positives relative to a single-endpoint probe.

## Experiment Design

### Data Collection Protocol

For N≥200 unique visitors, collect per-endpoint probe results:

```json
{
  "ipv6ProbeResults": {
    "endpoints": {
      "ipv6.test-ipv6.com": {"reachable": true, "rtt": 120},
      "ipv6.l.google.com": {"reachable": true, "rtt": 90},
      "v6.ident.me": {"reachable": false, "rtt": null}
    },
    "controlV4": {"reachable": true, "rtt": 30},
    "webrtcIPv6Candidates": 3,
    "ipVersion": "IPv4",
    "networkType": "wifi"
  }
}
```

The `webrtcIPv6Candidates` field from the WebRTC STUN test serves as **ground
truth**: if STUN reveals IPv6 addresses, the network definitely supports IPv6.

### Variables

**Independent variable:** Number of endpoints probed (1, 2, 3)

**Dependent variables:**
- True positive rate (probe reports IPv6 available when ground truth confirms it)
- False positive rate (probe reports IPv6 available when ground truth shows none)
- Mean probe completion time

**Covariates:** Network type (wifi, cellular, ethernet, satellite), browser family,
geographic region

### Statistical Power Analysis

| Test | Minimum N | Effect Size | α | Power |
|------|:---------:|:-----------:|:--:|:-----:|
| McNemar's (paired accuracy) | 50 | Cohen's g=0.15 | 0.05 | 0.80 |
| Per-network-type subgroup | 64/group | Cohen's d=0.5 | 0.05 | 0.80 |
| Correlation probe RTT vs actual | 85 | ρ=0.3 | 0.05 | 0.80 |

**Target:** N=256 total (64 × 4 network types) for powered subgroup analysis

### Endpoint Selection Rationale

| Endpoint | Type | Why |
|----------|------|-----|
| `ipv6.test-ipv6.com` | dual-stack | Industry standard, well-maintained |
| `ipv6.l.google.com` | AAAA only | Minimal DNS, Google infrastructure (reliable) |
| `v6.ident.me` | AAAA only | Simple ANY service, low latency |

**Control (IPv4):** `ipv4.test-ipv6.com` — same service family as endpoint 1

### Analysis Plan

1. **Per-endpoint accuracy:** Compute TP, FP, TN, FN against WebRTC ground truth
2. **Consensus rules:** Compare {1/3, 2/3, 3/3} thresholds using Youden's J
3. **RTT analysis:** Distribution of probe times by endpoint and network type
4. **Failure mode analysis:** Categorize each false positive/negative by network type
5. **Recommendation:** Select optimal number of endpoints and consensus threshold

### Statistical Corrections

- Benjamini-Hochberg FDR at q=0.05 for multiple endpoint comparisons
- Bootstrap 95% CIs for accuracy estimates (10,000 resamples)
- Pre-registered on OSF before analysis (Hypotheses 5.1, 5.2, 5.3)

## Integration

Once the experiment determines optimal parameters, the probe is updated:

```js
async function probeIPv6Connectivity() {
  const endpoints = [
    'https://ipv6.test-ipv6.com/',
    'https://ipv6.l.google.com/',
    'https://v6.ident.me/',
  ];
  const control = 'https://ipv4.test-ipv6.com/';
  // Per consensus result, require N/M successes
  // 2/3 is the initial hypothesis
}
```

## Timeline

| Week | Milestone | Data needed |
|:----:|-----------|:-----------:|
| 1 | Deploy instrumented probe | Collects per-endpoint data |
| 2-8 | Data collection | N≥256 visitors |
| 9 | Analysis + threshold selection | Complete dataset |
| 10 | Deploy optimized probe (PR 1.2) | Published thresholds |

## Limitations

- Selection bias: only users who visit Scrutari are sampled (tech-savvy, privacy-conscious)
- WebRTC ground truth may not be available in all browsers (Safari limits ICE candidates)
- Network type detection via `navigator.connection.effectiveType` is heuristic
