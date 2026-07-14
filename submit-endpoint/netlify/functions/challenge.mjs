// Netlify Edge Function: PoW Challenge Issuance
// Issues cryptographic challenges for proof-of-work verification.
// Browser must compute SHA256(challenge + nonce) with >= difficulty leading zero bits.
//
// GET /api/challenge → { challenge, difficulty, expires }
//
// The response includes:
//   challenge:  random hex string (32 bytes → 64 hex chars)
//   difficulty: number of leading zero bits required (default 16)
//   expires:    ISO timestamp when the challenge expires (default 60s)
//   algorithm:  'SHA-256'

import { randomBytes, timingSafeEqual, createHash } from 'crypto';

// In-memory challenge store (per warm container)
// Netlify edge functions can share global state within a container
const challenges = new Map();

// Clean expired challenges every 60s
if (typeof globalThis.__challengePrune === 'undefined') {
  globalThis.__challengePrune = setInterval(() => {
    const now = Date.now();
    for (const [key, val] of challenges) {
      if (val.expiresAt <= now) challenges.delete(key);
    }
  }, 60000);
}

// Default difficulty: 16 leading zero bits
// This requires ~50K SHA-256 attempts on average (50% success rate)
// On a modern browser: ~5-50ms depending on CPU
const DEFAULT_DIFFICULTY = 16;
const CHALLENGE_TTL = 60000; // 60 seconds
const CHALLENGE_BYTES = 32; // 256 bits of randomness

// Verify a PoW proof: SHA256(challenge + nonce) has >= difficulty leading zero bits
export function verifyPoW(challenge, nonce, difficulty) {
  if (!challenge || typeof challenge !== 'string') return false;
  if (nonce === undefined || nonce === null) return false;
  if (typeof difficulty !== 'number' || difficulty < 1 || difficulty > 256) return false;

  const input = challenge + String(nonce);
  const hash = createHash('sha256').update(input).digest();

  // Count leading zero bits
  let bits = 0;
  for (let i = 0; i < hash.length; i++) {
    if (hash[i] === 0) {
      bits += 8;
    } else {
      // Count leading zero bits in this byte
      let byte = hash[i];
      while ((byte & 0x80) === 0) {
        bits++;
        byte <<= 1;
      }
      break;
    }
  }

  return bits >= difficulty;
}

export default async (req, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'GET only' }), { status: 405, headers });
  }

  // Generate challenge
  const challengeBytes = randomBytes(CHALLENGE_BYTES);
  const challenge = challengeBytes.toString('hex');
  const expiresAt = Date.now() + CHALLENGE_TTL;
  const expires = new Date(expiresAt).toISOString();

  // Store in challenge map
  challenges.set(challenge, { challenge, expiresAt, difficulty: DEFAULT_DIFFICULTY, used: false });

  // Auto-clean: remove this specific entry on expiry
  setTimeout(() => challenges.delete(challenge), CHALLENGE_TTL);

  return new Response(JSON.stringify({
    challenge,
    difficulty: DEFAULT_DIFFICULTY,
    expires,
    algorithm: 'SHA-256',
    ttl: CHALLENGE_TTL,
  }), { status: 200, headers });
};
