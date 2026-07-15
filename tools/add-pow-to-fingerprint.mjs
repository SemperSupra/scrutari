// Tool: Add PoW challenge-response to captureFingerprint
// Makes the PoW proof a fingerprint signal — part of the dedup hash
// Run: node tools/add-pow-to-fingerprint.mjs

import fs from 'fs';

const html = fs.readFileSync('index.html', 'utf-8');

// Find the LAST copy of the PoW benchmark section
const marker = "fp['PoW Hashing'] = 'SHA-256 via Web Crypto API';";
const lastIdx = html.lastIndexOf(marker);
if (lastIdx === -1) { console.error('Marker not found'); process.exit(1); }

const powFingerprintCode = `
  // Challenge-response PoW — proves JS execution, becomes fingerprint signal
  try {
    var _powFpChallenge = null, _powFpNonce = null, _powFpDifficulty = 16;
    var _powFpStart = performance.now();
    var _powFpResp = await fetch('/api/challenge');
    if (_powFpResp.ok) {
      var _powFpData = await _powFpResp.json();
      _powFpChallenge = _powFpData.challenge;
      _powFpDifficulty = _powFpData.difficulty || 16;
    }
    if (_powFpChallenge) {
      var _powFpEnc = new TextEncoder();
      var _powFpMax = 200000;
      for (_powFpNonce = 0; _powFpNonce < _powFpMax; _powFpNonce++) {
        var _powFpIn = _powFpChallenge + _powFpNonce.toString(16);
        var _powFpBuf = await crypto.subtle.digest('SHA-256', _powFpEnc.encode(_powFpIn));
        var _powFpArr = Array.from(new Uint8Array(_powFpBuf));
        var _powFpBits = 0;
        for (var _bi2 = 0; _bi2 < _powFpArr.length; _bi2++) {
          if (_powFpArr[_bi2] === 0) { _powFpBits += 8; }
          else {
            var _b2 = _powFpArr[_bi2];
            while ((_b2 & 0x80) === 0) { _powFpBits++; _b2 <<= 1; }
            break;
          }
        }
        if (_powFpBits >= _powFpDifficulty) { break; }
      }
      var _powFpEnd = performance.now();
      fp['PoW Challenge'] = _powFpChallenge.substring(0, 16); // truncated for fingerprint stability
      fp['PoW Nonce'] = _powFpNonce < _powFpMax ? _powFpNonce : 'not found';
      fp['PoW Difficulty'] = _powFpDifficulty;
      fp['PoW Proof Time'] = Math.round((_powFpEnd - _powFpStart) * 10) / 10 + 'ms';
    }
  } catch(_e2) { fp['PoW Proof'] = 'error: ' + (_e2.message || 'unknown'); }
`;

// Insert AFTER the benchmark PoW section
const insertPoint = lastIdx + marker.length;
const result = html.substring(0, insertPoint) + '\n' + powFingerprintCode + html.substring(insertPoint);

// Now add the challenge fields to buildSubmissionData for the dedup hash
// Find the last buildSubmissionData and add PoW fields
const submitMarker = '// PoW benchmark speed (hashes/sec)';
const submitIdx = result.lastIndexOf(submitMarker);
if (submitIdx >= 0) {
  const powFieldCode = `\n  // Challenge-response PoW proof (fingerprint signal, anti-replay)
  try {
    var _pfp = fp || {};
    if (_pfp['PoW Challenge']) safe.powChallenge = _pfp['PoW Challenge'];
    if (_pfp['PoW Nonce'] !== undefined) safe.powNonce = _pfp['PoW Nonce'];
    if (_pfp['PoW Difficulty']) safe.powDifficulty = parseInt(_pfp['PoW Difficulty'], 10) || 16;
    if (_pfp['PoW Proof Time']) {
      var _ppt = parseFloat(_pfp['PoW Proof Time']);
      if (!isNaN(_ppt)) safe.powProofTime = _ppt;
    }
  } catch(_pe2){}`;
  const result2 = result.substring(0, submitIdx) + powFieldCode + result.substring(submitIdx);
  fs.writeFileSync('index.html', result2, 'utf-8');
  console.log('PoW fingerprint integration complete');
} else {
  console.log('Warning: buildSubmissionData marker not found');
  fs.writeFileSync('index.html', result, 'utf-8');
}
