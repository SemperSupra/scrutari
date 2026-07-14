// Scrutari Test: PoW Challenge-Response System
// Tests challenge generation, PoW computation, and verification

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'crypto';

// Server-side verifyPoW (mirrors challenge.mjs + server.js)
function verifyPoW(challenge, nonce, difficulty) {
  if (!challenge || typeof challenge !== 'string') return false;
  if (nonce === undefined || nonce === null) return false;
  if (typeof difficulty !== 'number' || difficulty < 1 || difficulty > 256) return false;

  const input = challenge + String(nonce);
  const hash = createHash('sha256').update(input).digest();

  let bits = 0;
  for (let i = 0; i < hash.length; i++) {
    if (hash[i] === 0) {
      bits += 8;
    } else {
      let byte = hash[i];
      while ((byte & 0x80) === 0) { bits++; byte <<= 1; }
      break;
    }
  }
  return bits >= difficulty;
}

// Client-side PoW computation (mirrors index.html logic)
function computePoW(challenge, difficulty, maxAttempts = 50000) {
  for (let nonce = 0; nonce < maxAttempts; nonce++) {
    if (verifyPoW(challenge, nonce, difficulty)) {
      return nonce;
    }
  }
  return null;
}

describe('PoW verification', () => {
  it('verifies valid proof', () => {
    const challenge = randomBytes(32).toString('hex');
    const nonce = computePoW(challenge, 8, 5000); // difficulty 8 = fast
    assert.ok(nonce !== null, 'should find a valid nonce');
    assert.ok(verifyPoW(challenge, nonce, 8), 'should verify');
  });

  it('rejects invalid nonce', () => {
    const challenge = randomBytes(32).toString('hex');
    // A wrong nonce should not verify
    const result = verifyPoW(challenge, 0, 256); // difficulty 256 is impossible
    assert.equal(result, false);
  });

  it('rejects difficulty 0 (minimum is 1)', () => {
    const challenge = randomBytes(32).toString('hex');
    assert.equal(verifyPoW(challenge, 0, 0), false);
    
  });

  it('rejects null/undefined challenge', () => {
    assert.equal(verifyPoW(null, 0, 8), false);
    assert.equal(verifyPoW(undefined, 0, 8), false);
  });

  it('rejects null/undefined nonce', () => {
    const challenge = randomBytes(32).toString('hex');
    assert.equal(verifyPoW(challenge, null, 8), false);
    assert.equal(verifyPoW(challenge, undefined, 8), false);
  });

  it('rejects invalid difficulty', () => {
    const challenge = randomBytes(32).toString('hex');
    assert.equal(verifyPoW(challenge, 0, -1), false);
    assert.equal(verifyPoW(challenge, 0, 0), false); // difficulty must be >= 1
    assert.equal(verifyPoW(challenge, 0, 257), false);
  });

  it('different challenges produce different results', () => {
    const c1 = randomBytes(32).toString('hex');
    const c2 = randomBytes(32).toString('hex');
    const n1 = computePoW(c1, 12, 50000);
    const n2 = computePoW(c2, 12, 50000);
    // Verifying one challenge's nonce against a different challenge should fail
    if (n1 !== null && n2 !== null) {
      assert.ok(verifyPoW(c1, n1, 12), 'self-verification works');
      // Cross-verification should fail with high probability
      assert.equal(verifyPoW(c2, n1, 12), false, 'cross-challenge verification should fail');
    }
  });

  it('computes PoW within reasonable time', () => {
    const challenge = randomBytes(32).toString('hex');
    const start = Date.now();
    const nonce = computePoW(challenge, 12, 20000);
    const elapsed = Date.now() - start;
    assert.ok(nonce !== null, 'should find nonce');
    assert.ok(elapsed < 5000, `should complete within 5s (took ${elapsed}ms)`);
  });

  it('nonce is deterministic for same challenge+difficulty', () => {
    const challenge = 'test-challenge-123';
    const n1 = computePoW(challenge, 16, 100000);
    const n2 = computePoW(challenge, 16, 100000);
    assert.equal(n1, n2, 'same challenge produces same nonce');
  });
});

