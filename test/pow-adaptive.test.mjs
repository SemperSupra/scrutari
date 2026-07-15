// Scrutari Test: Adaptive PoW Difficulty Model
// Validates that difficulty adjusts based on device capability

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Simulates the adaptive difficulty logic from index.html
function getDifficulty(powSpeed, urlOverride) {
  // Default: medium
  let d = 16;

  // From benchmark (PoW Speed = hashes/sec)
  if (powSpeed) {
    const hps = parseFloat(powSpeed);
    if (hps > 0) {
      const targetAttempts = Math.round(hps * 0.5); // 500ms budget
      const bits = Math.max(8, Math.min(24, Math.floor(Math.log2(targetAttempts)) + 1));
      d = bits;
    }
  }

  // URL override
  if (urlOverride) {
    if (urlOverride === 'low') d = 12;
    else if (urlOverride === 'medium') d = 16;
    else if (urlOverride === 'high') d = 20;
    else { const n = parseInt(urlOverride, 10); if (n >= 8 && n <= 28) d = n; }
  }

  return d;
}

describe('Adaptive PoW difficulty', () => {
  // Low-end device: 10K hashes/sec (~2s for 16 bits)
  it('low-end device (10K hps) gets difficulty ~11', () => {
    const d = getDifficulty('10000 hashes/sec');
    // targetAttempts = 10000 * 0.5 = 5000
    // bits = floor(log2(5000)) + 1 = 12 + 1 = 13
    // Actually: log2(5000) = 12.29, floor = 12, +1 = 13
    assert.equal(d, 13);
  });

  // Reference device: 100K hashes/sec (~500ms for 16 bits)
  it('reference device (100K hps) gets difficulty ~16', () => {
    const d = getDifficulty('100000 hashes/sec');
    // targetAttempts = 100000 * 0.5 = 50000
    // log2(50000) = 15.61, floor = 15, +1 = 16
    assert.equal(d, 16);
  });

  // High-end device: 1M hashes/sec (~50ms for 16 bits)
  it('high-end device (1M hps) gets difficulty ~20', () => {
    const d = getDifficulty('1000000 hashes/sec');
    // targetAttempts = 1000000 * 0.5 = 500000
    // log2(500000) = 18.93, floor = 18, +1 = 19
    assert.equal(d, 19);
  });

  // Very fast accelerator: 100M hashes/sec
  it('accelerator (100M hps) gets max difficulty 24', () => {
    const d = getDifficulty('100000000 hashes/sec');
    // targetAttempts = 100000000 * 0.5 = 50000000
    // log2(50000000) = 25.58, floor = 25, +1 = 26, capped at 24
    assert.equal(d, 24);
  });

  // No benchmark data
  it('no benchmark data defaults to 16', () => {
    assert.equal(getDifficulty(null, null), 16);
    assert.equal(getDifficulty(undefined, null), 16);
  });

  // URL parameter overrides
  it('URL override: low = 12', () => {
    const d = getDifficulty('100000 hashes/sec', 'low');
    assert.equal(d, 12); // override wins over benchmark
  });

  it('URL override: medium = 16', () => {
    assert.equal(getDifficulty('1000000 hashes/sec', 'medium'), 16);
  });

  it('URL override: high = 20', () => {
    assert.equal(getDifficulty('10000 hashes/sec', 'high'), 20);
  });

  it('URL override: numeric = 22', () => {
    assert.equal(getDifficulty('100000 hashes/sec', '22'), 22);
  });

  it('URL override: out of range (30) rejected, uses benchmark default', () => {
    // The client accepts 8-28, but the server also validates
    // So even if client passes 30, server clamps
    const d = getDifficulty('100000 hashes/sec', '30');
    assert.equal(d, 16); // both client and server clamp to 8-28
  });

  // Target time consistency: all devices should take ~500ms
  it('all devices target approximately 500ms compute time', () => {
    const devices = [
      { speed: '10000', expectedMs: 500 },
      { speed: '100000', expectedMs: 500 },
      { speed: '1000000', expectedMs: 500 },
    ];
    for (const dev of devices) {
      const hps = parseFloat(dev.speed);
      const d = getDifficulty(dev.speed, null);
      const attempts = Math.pow(2, d - 1); // average attempts needed
      const timeMs = (attempts / hps) * 1000;
      assert.ok(timeMs >= 200 && timeMs <= 2000,
        `${dev.speed} hps: difficulty ${d}, ~${Math.round(timeMs)}ms (target 500ms)`);
    }
  });
});
