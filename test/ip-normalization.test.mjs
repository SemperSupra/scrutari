// Scrutari Test: IPv6 Normalization
// Tests the normalizeIP() function that must be present in all endpoint handlers

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// IMPORTANT: This is the canonical normalizeIP implementation.
// Copy-paste into every endpoint handler. Keep these test cases passing.
function normalizeIP(ip) {
  if (!ip || ip === 'unknown') return 'unknown';
  // Strip brackets from bracketed IPv6 addresses first: [::1] → ::1
  if (ip.startsWith('[') && ip.endsWith(']')) ip = ip.slice(1, -1);
  // Strip IPv6-mapped IPv4 prefix: ::ffff:1.2.3.4 → 1.2.3.4
  if (ip.startsWith('::ffff:')) return ip.substring(7);
  // Normalize IPv6 loopback to IPv4 loopback
  if (ip === '::1') return '127.0.0.1';
  return ip;
}

describe('normalizeIP', () => {
  const cases = [
    // [input, expected]
    ['::ffff:10.0.0.1', '10.0.0.1'],
    ['::ffff:192.168.1.1', '192.168.1.1'],
    ['::ffff:203.0.113.42', '203.0.113.42'],
    ['::1', '127.0.0.1'],
    ['[::1]', '127.0.0.1'], // Bracketed loopback normalizes to 127.0.0.1
    ['127.0.0.1', '127.0.0.1'],
    ['192.168.1.1', '192.168.1.1'],
    ['2001:db8::1', '2001:db8::1'],
    ['2001:db8:85a3::8a2e:370:7334', '2001:db8:85a3::8a2e:370:7334'],
    ['unknown', 'unknown'],
    ['', 'unknown'],
    [null, 'unknown'],
    [undefined, 'unknown'],
    ['[::ffff:10.0.0.1]', '10.0.0.1'], // Bracketed v6-mapped
    ['[2001:db8::1]', '2001:db8::1'], // Bracketed native IPv6
    ['::ffff:10.0.0.1', '10.0.0.1'], // Same client over v4-mapped v6
    ['::ffff:10.0.0.1', '10.0.0.1'], // Must be idempotent (already normalized)
  ];

  for (const [input, expected] of cases) {
    it(`normalizeIP(${JSON.stringify(input)}) → ${JSON.stringify(expected)}`, () => {
      // For idempotency test, apply twice
      const once = normalizeIP(input);
      const twice = normalizeIP(once);
      assert.equal(once, expected);
      assert.equal(twice, expected); // Must be idempotent
    });
  }

  it('same client over v4 and v6-mapped produces same normalized form', () => {
    assert.equal(normalizeIP('10.0.0.1'), normalizeIP('::ffff:10.0.0.1'));
    assert.equal(normalizeIP('192.168.1.1'), normalizeIP('::ffff:192.168.1.1'));
  });
});
