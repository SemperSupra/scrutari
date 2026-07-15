// Scrutari Test: PoW Timing Anomaly Detection Model
// Validates the hardware-based expected time prediction model

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Simulates the PoW timing model from index.html
function predictExpectedMs(hardware) {
  const refCores = 4, refMs = 500;
  const cores = hardware.cores || refCores;
  const coreScale = cores > 0 ? refCores / cores : 1.0;

  let memScale = 1.0;
  if (hardware.memory && hardware.memory > 0) {
    memScale = 8 / hardware.memory;
  }

  let platScale = 1.0;
  const plat = (hardware.platform || '').toLowerCase();
  if (plat.includes('mac')) platScale = 0.7;
  else if (plat.includes('win')) platScale = 1.2;
  else if (plat.includes('linux')) platScale = 1.5;

  return Math.round(refMs * coreScale * memScale * platScale * 10) / 10;
}

function computeAnomaly(actualMs, expectedMs) {
  if (actualMs <= 0 || expectedMs <= 0) return { ratio: null, detected: false };
  const ratio = Math.round((actualMs / expectedMs) * 100) / 100;
  return { ratio, detected: ratio > 3 || ratio < 0.3 };
}

describe('PoW timing prediction model', () => {
  // Reference machine: 4 cores, 8GB RAM, macOS
  it('reference machine (4c/8GB/macOS) predicts ~350ms', () => {
    const ms = predictExpectedMs({ cores: 4, memory: 8, platform: 'MacIntel' });
    assert.ok(ms >= 300 && ms <= 400, `expected ~350ms, got ${ms}ms`);
  });

  // High-end machine: 16 cores, 32GB RAM, macOS
  it('high-end mac (16c/32GB) predicts ~22ms', () => {
    const ms = predictExpectedMs({ cores: 16, memory: 32, platform: 'MacARM64' });
    assert.equal(ms, 21.9);
  });

  // Low-end VM: 2 cores, 2GB RAM, Linux headless
  it('low-end VM (2c/2GB/Linux) predicts ~6000ms', () => {
    const ms = predictExpectedMs({ cores: 2, memory: 2, platform: 'Linux' });
    assert.equal(ms, 6000);
  });

  // Windows mid-range: 8 cores, 16GB RAM
  it('mid-range Windows (8c/16GB) predicts ~150ms', () => {
    const ms = predictExpectedMs({ cores: 8, memory: 16, platform: 'Win32' });
    assert.ok(ms >= 120 && ms <= 200, `expected ~150ms, got ${ms}ms`);
  });

  // Unknown hardware: defaults to reference
  it('unknown hardware falls back to reference', () => {
    const ms = predictExpectedMs({});
    assert.equal(ms, 500);
  });
});

describe('PoW timing anomaly detection', () => {
  it('normal timing: ratio ~1.0 is not anomalous', () => {
    const a = computeAnomaly(500, 500);
    assert.equal(a.detected, false);
    assert.equal(a.ratio, 1.0);
  });

  it('accelerator: 10x faster than expected is anomalous', () => {
    const a = computeAnomaly(30, 500);
    assert.equal(a.detected, true);
    assert.ok(a.ratio < 0.3);
  });

  it('overloaded: 5x slower than expected is anomalous', () => {
    const a = computeAnomaly(2500, 500);
    assert.equal(a.detected, true);
    assert.ok(a.ratio > 3);
  });

  it('slightly faster (0.5x) is not anomalous', () => {
    const a = computeAnomaly(250, 500);
    assert.equal(a.detected, false);
  });

  it('slightly slower (2x) is not anomalous', () => {
    const a = computeAnomaly(1000, 500);
    assert.equal(a.detected, false);
  });

  it('zero or negative values are handled gracefully', () => {
    assert.equal(computeAnomaly(0, 500).detected, false);
    assert.equal(computeAnomaly(500, 0).detected, false);
    assert.equal(computeAnomaly(-1, 500).detected, false);
  });
});
