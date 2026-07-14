// Scrutari Property-Based Tests (fast-check)
// Validates invariants hold for ALL possible inputs, not just hand-picked cases

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fc from 'fast-check';

// ─── Rate limiter invariants ───

function makeLimiter(windowMs = 5000, maxPerWindow = 1) {
  const _windows = new Map();
  return {
    allow(ip) {
      const now = Date.now();
      let timestamps = _windows.get(ip);
      const cutoff = now - windowMs;
      if (timestamps) {
        let lo = 0, hi = timestamps.length;
        while (lo < hi) { const mid = (lo + hi) >>> 1; if (timestamps[mid] < cutoff) lo = mid + 1; else hi = mid; }
        timestamps = timestamps.slice(lo);
      } else { timestamps = []; }
      if (timestamps.length >= maxPerWindow) return false;
      timestamps.push(now);
      _windows.set(ip, timestamps);
      return true;
    },
    _windows,
  };
}

describe('Rate limiter (property-based)', () => {
  it('first request from any IPv4 is always allowed', () => {
    fc.assert(
      fc.property(fc.ipV4(), (ip) => {
        const limiter = makeLimiter(5000, 1);
        return limiter.allow(ip) === true;
      }),
    );
  });

  it('first request from any IPv6 is always allowed', () => {
    fc.assert(
      fc.property(fc.ipV6(), (ip) => {
        const limiter = makeLimiter(5000, 1);
        return limiter.allow(ip) === true;
      }),
    );
  });

  it('different IPs never interfere with each other', () => {
    fc.assert(
      fc.property(fc.ipV4(), fc.ipV4(), fc.ipV4(), (a, b, c) => {
        const limiter = makeLimiter(5000, 1);
        limiter.allow(a);
        limiter.allow(b);
        // Third unique IP should always be allowed
        return limiter.allow(c) === true;
      }),
    );
  });

  it('idempotent: same IP repeatedly returns same result within window', () => {
    fc.assert(
      fc.property(fc.ipV4(), (ip) => {
        const limiter = makeLimiter(50000, 3); // long window, 3 max
        const results = [];
        for (let i = 0; i < 5; i++) {
          results.push(limiter.allow(ip));
        }
        // First 3 should be true, next 2 should be false
        return results[0] === true && results[1] === true &&
               results[2] === true && results[3] === false && results[4] === false;
      }),
    );
  });
});

// ─── normalizeIP invariants ───

function normalizeIP(ip) {
  if (!ip || ip === 'unknown') return 'unknown';
  if (ip.startsWith('[') && ip.endsWith(']')) ip = ip.slice(1, -1);
  if (ip.startsWith('::ffff:')) return ip.substring(7);
  if (ip === '::1') return '127.0.0.1';
  return ip;
}

describe('normalizeIP (property-based)', () => {
  it('idempotent: applying twice is always safe', () => {
    fc.assert(
      fc.property(fc.oneof(fc.ipV4(), fc.ipV6(), fc.constant('unknown'), fc.constant('')), (ip) => {
        const once = normalizeIP(ip);
        const twice = normalizeIP(once);
        return once === twice;
      }),
    );
  });

  it('never returns null or undefined', () => {
    fc.assert(
      fc.property(fc.oneof(fc.ipV4(), fc.ipV6(), fc.string()), (ip) => {
        const result = normalizeIP(ip);
        return result !== null && result !== undefined;
      }),
    );
  });

  it('::ffff: prefix always stripped to IPv4', () => {
    fc.assert(
      fc.property(fc.ipV4(), (ipv4) => {
        const v6mapped = '::ffff:' + ipv4;
        const result = normalizeIP(v6mapped);
        return result === ipv4;
      }),
    );
  });
});

// ─── Schema validation invariants ───

function schemaValidate(data) {
  const errors = [];
  if (data === null || typeof data !== 'object') return ['Request body must be a JSON object'];
  if (typeof data.version !== 'number') errors.push('version must be a number');
  if (data.version < 1) errors.push('version must be >= 1');
  return errors.length > 0 ? errors : null;
}

describe('schemaValidate (property-based)', () => {
  it('never throws for any object input', () => {
    fc.assert(
      fc.property(fc.object(), (obj) => {
        const result = schemaValidate({ version: 1, ...obj });
        // Must return either null (valid) or string[] (errors)
        return result === null || Array.isArray(result);
      }),
    );
  });

  it('rejects any object without a numeric version', () => {
    fc.assert(
      fc.property(fc.object().filter(o => typeof o.version !== 'number'), (obj) => {
        const result = schemaValidate(obj);
        return result !== null && result.some(e => e.includes('version'));
      }),
    );
  });
});
