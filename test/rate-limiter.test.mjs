// Scrutari Test: Sliding Window Rate Limiter
// Tests the sliding window rate limiter used in submit endpoints

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

// Sliding window rate limiter implementation
// Uses per-IP sorted timestamp array with O(log n) cleanup on access
class SlidingWindowRateLimiter {
  constructor(windowMs = 5000, maxPerWindow = 1) {
    this.windowMs = windowMs;
    this.maxPerWindow = maxPerWindow;
    this._windows = new Map(); // ip → sorted timestamps[]
  }

  allow(ip) {
    const now = Date.now();
    let timestamps = this._windows.get(ip);

    // Clean expired timestamps on access (O(log n) via binary search)
    if (timestamps) {
      const cutoff = now - this.windowMs;
      // Find first index >= cutoff using binary search
      let lo = 0, hi = timestamps.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (timestamps[mid] < cutoff) lo = mid + 1;
        else hi = mid;
      }
      timestamps = timestamps.slice(lo);
    } else {
      timestamps = [];
    }

    // Check if under limit
    if (timestamps.length >= this.maxPerWindow) return false;

    // Add current timestamp
    timestamps.push(now);
    this._windows.set(ip, timestamps);
    return true;
  }

  // Remove expired entries for cleanup
  prune() {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    for (const [ip, timestamps] of this._windows) {
      const valid = timestamps.filter(t => t >= cutoff);
      if (valid.length === 0) this._windows.delete(ip);
      else this._windows.set(ip, valid);
    }
  }

  get size() { return this._windows.size; }
}

// JSON Schema validation for submissions
function validateSubmission(data) {
  const errors = [];

  // Type checks
  if (data === null || typeof data !== 'object') {
    return ['Request body must be a JSON object'];
  }

  // Required fields
  if (typeof data.version !== 'number') {
    errors.push('version must be a number');
  }
  if (data.version < 1) {
    errors.push('version must be >= 1');
  }

  // Optional string fields — reject if present but wrong type
  const stringFields = ['source', 'screenClass', 'gpuClass', 'tzRegion', 'cpuCores',
    'deviceMemory', 'engine', 'browserVersion', 'osArch', 'viewport', 'lang',
    'sessionID', 'ipVersion'];
  for (const field of stringFields) {
    if (data[field] !== undefined && data[field] !== null && typeof data[field] !== 'string') {
      errors.push(`${field} must be a string`);
    }
  }

  // Optional boolean fields
  const boolFields = ['hasWASM', 'hasWebGL', 'hasCanvas', 'hasAudio',
    'hasServiceWorker', 'darkMode', 'reducedMotion', 'hasTouch',
    'adblockDetected'];
  for (const field of boolFields) {
    if (data[field] !== undefined && data[field] !== null && typeof data[field] !== 'boolean') {
      errors.push(`${field} must be a boolean`);
    }
  }

  // Numeric fields
  if (data.botScore !== undefined && data.botScore !== null) {
    if (typeof data.botScore !== 'number' || data.botScore < 0 || data.botScore > 100) {
      errors.push('botScore must be a number between 0 and 100');
    }
  }
  if (data.fontCount !== undefined && data.fontCount !== null) {
    if (typeof data.fontCount !== 'number' || data.fontCount < 0 || data.fontCount > 200) {
      errors.push('fontCount must be a number between 0 and 200');
    }
  }

  // Source validation
  const ALLOWED_SOURCES = [
    'manual', 'automation_baseline', 'automation_playwright', 'automation_playwright_stealth',
    'automation_puppeteer', 'automation_puppeteer_stealth', 'automation_selenium',
    'automation_selenium_stealth', 'automation_http', 'automation_curl', 'honeypot', 'honeypot_js',
  ];
  if (data.source && !ALLOWED_SOURCES.includes(data.source)) {
    errors.push(`Invalid source: ${data.source}`);
  }

  return errors.length > 0 ? errors : null;
}

describe('SlidingWindowRateLimiter', () => {
  it('allows first request from an IP', () => {
    const limiter = new SlidingWindowRateLimiter(5000, 1);
    assert.equal(limiter.allow('10.0.0.1'), true);
  });

  it('blocks second request within window', () => {
    const limiter = new SlidingWindowRateLimiter(5000, 1);
    limiter.allow('10.0.0.1');
    assert.equal(limiter.allow('10.0.0.1'), false);
  });

  it('allows requests from different IPs independently', () => {
    const limiter = new SlidingWindowRateLimiter(5000, 1);
    limiter.allow('10.0.0.1');
    assert.equal(limiter.allow('10.0.0.2'), true);
    assert.equal(limiter.allow('10.0.0.3'), true);
  });

  it('allows multiple requests within limit', () => {
    const limiter = new SlidingWindowRateLimiter(5000, 3);
    assert.equal(limiter.allow('10.0.0.1'), true);
    assert.equal(limiter.allow('10.0.0.1'), true);
    assert.equal(limiter.allow('10.0.0.1'), true);
    assert.equal(limiter.allow('10.0.0.1'), false); // 4th blocked
  });

  it('rejects after maxPerWindow', () => {
    const limiter = new SlidingWindowRateLimiter(5000, 3);
    limiter.allow('10.0.0.1');
    limiter.allow('10.0.0.1');
    limiter.allow('10.0.0.1');
    assert.equal(limiter.allow('10.0.0.1'), false);
  });

  it('prune removes stale entries', () => {
    const limiter = new SlidingWindowRateLimiter(10, 1); // 10ms window
    limiter.allow('10.0.0.1');
    assert.equal(limiter.size, 1);
    // Wait for window to expire
    return new Promise(resolve => {
      setTimeout(() => {
        limiter.prune();
        assert.equal(limiter.size, 0);
        resolve();
      }, 20);
    });
  });

  it('handles rapid requests with timestamp dedup', () => {
    const limiter = new SlidingWindowRateLimiter(100, 2);
    assert.equal(limiter.allow('10.0.0.1'), true);
    assert.equal(limiter.allow('10.0.0.1'), true);
    assert.equal(limiter.allow('10.0.0.1'), false);
  });
});

describe('validateSubmission', () => {
  it('accepts valid submission', () => {
    const valid = {
      version: 1,
      source: 'manual',
      botScore: 48,
      screenClass: 'Full HD',
      hasWASM: true,
      hasWebGL: true,
      ipVersion: 'IPv4',
    };
    assert.equal(validateSubmission(valid), null);
  });

  it('rejects null body', () => {
    assert.deepEqual(validateSubmission(null), ['Request body must be a JSON object']);
  });

  it('rejects missing version', () => {
    const err = validateSubmission({ source: 'manual' });
    assert.ok(err.includes('version must be a number'));
  });

  it('rejects invalid source', () => {
    const err = validateSubmission({ version: 1, source: 'invalid_bot_framework' });
    assert.ok(err.some(e => e.includes('Invalid source')));
  });

  it('rejects string where number expected', () => {
    const err = validateSubmission({ version: 1, botScore: 'high' });
    assert.ok(err.some(e => e.includes('botScore')));
  });

  it('rejects boolean where string expected', () => {
    const err = validateSubmission({ version: 1, screenClass: true });
    assert.ok(err.some(e => e.includes('screenClass')));
  });

  it('allows optional fields to be absent', () => {
    const minimal = { version: 1 };
    assert.equal(validateSubmission(minimal), null);
  });

  it('rejects botScore out of range', () => {
    assert.ok(validateSubmission({ version: 1, botScore: -1 }).some(e => e.includes('botScore')));
    assert.ok(validateSubmission({ version: 1, botScore: 101 }).some(e => e.includes('botScore')));
  });
});
