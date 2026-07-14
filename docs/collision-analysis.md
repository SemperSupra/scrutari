# Dedup Hash Collision Probability Analysis

## Summary

The dedup fingerprint hash uses the first **16 hex characters** (64 bits) of
SHA-256. This document analyzes the collision probability for the research
dataset at expected scale.

## Hash Design

```js
const fpHash = createHash('sha256')
  .update(JSON.stringify(fingerprintAttributes))
  .digest('hex')
  .substring(0, 16);
```

The 64-bit truncation is a tradeoff between collision resistance and storage
efficiency (longer hashes increase blob storage costs linearly with unique
fingerprint count).

## Collision Probability

For a 64-bit hash with N unique fingerprints, the collision probability via
birthday paradox is:

P(collision) ≈ 1 − exp(−N² / (2 × 2⁶⁴))

| N (unique fingerprints) | P(collision) | Risk Level |
|:----------------------:|:------------:|:----------:|
| 10³ (1K) | 2.7 × 10⁻¹⁴ | Negligible |
| 10⁴ (10K) | 2.7 × 10⁻¹² | Negligible |
| 10⁵ (100K) | 2.7 × 10⁻¹⁰ | Negligible |
| 10⁶ (1M) | 2.7 × 10⁻⁸ | Negligible |
| 10⁷ (10M) | 2.7 × 10⁻⁶ | Acceptable |
| 10⁸ (100M) | 2.7 × 10⁻⁴ | Low risk |
| 10⁹ (1B) | 2.7 × 10⁻² | Non-trivial |
| 4.3 × 10⁹ (2³²) | ~0.5 | Too high |

## Expected Scale

At the current collection rate (~1-5 submissions/day), reaching even 10⁶ unique
fingerprints would take ~550 years. With active recruitment (100 submissions/day),
10⁶ would take ~30 years. The 50% collision threshold (4.3 billion) is not
reachable within the project's lifetime.

## Risk Mitigation

Even in the negligible-probability case, a collision has bounded impact:

1. **Frequency inflation:** Two different fingerprints that happen to collide
   will be counted as the same fingerprint, inflating the frequency counter by
   at most 1 for the natural lifetime of each fingerprint. This introduces at
   most 1/N error in frequency estimates.

2. **Entropy underestimation:** A collision causes two distinct observations to
   be merged, slightly reducing the apparent diversity → entropy estimates are
   slightly conservative (underestimates uniqueness → lower false positive rate
   for privacy claims).

3. **No security impact:** The hash is used for deduplication only, not for
   authentication, authorization, or cryptographic verification. A collision
   does not enable any attack.

## Recommendation

The current 64-bit truncation is **acceptable** for the project's expected
scale (N < 10⁷). No change needed.

If the project grows beyond expectations, the fix is straightforward:
increase truncation length to 20 hex chars (80 bits), which raises the
50% collision threshold to ~10¹² entries — far beyond what Netlify Blob's
1GB storage limit can hold.

## Formal verification note

This analysis assumes SHA-256 behaves as a random oracle (uniform output
distribution). SHA-256's output is computationally indistinguishable from
random for collision analysis purposes. No formal proof is required beyond
the standard cryptographic assumption.
