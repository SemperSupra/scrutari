// Tool: Add adaptive PoW difficulty based on hardware benchmark
// Run: node tools/add-adaptive-pow.mjs

import fs from 'fs';

const html = fs.readFileSync('index.html', 'utf-8');

// Find the adaptive difficulty insertion point (before challenge URL construction)
const marker = 'var chalUrl = window.SUBMISSION_ENDPOINT';
const idx = html.lastIndexOf(marker);
if (idx === -1) { console.error('Marker not found'); process.exit(1); }

const insertion = `  // Determine PoW difficulty tier from hardware benchmark
  // Target: ~500ms compute time on any device regardless of CPU speed
  var _difficulty = 16; // default: medium
  try {
    var _powSpeed = __lastFingerprintData ? __lastFingerprintData['PoW Speed'] : null;
    if (_powSpeed) {
      var _hps = parseFloat(_powSpeed);
      if (_hps > 0) {
        var _targetAttempts = Math.round(_hps * 0.5);
        // difficulty bits needed: floor(log2(targetAttempts)) + 1
        var _bits = Math.max(8, Math.min(24, Math.floor(Math.log2(_targetAttempts)) + 1));
        _difficulty = _bits;
      }
    }
  } catch(_e) {}
  // URL override: ?difficulty=low|medium|high|NUM
  try {
    var _dp = new URLSearchParams(window.location.search).get('difficulty');
    if (_dp) {
      if (_dp === 'low') _difficulty = 12;
      else if (_dp === 'medium') _difficulty = 16;
      else if (_dp === 'high') _difficulty = 20;
      else { var _dn = parseInt(_dp, 10); if (_dn >= 8 && _dn <= 28) _difficulty = _dn; }
    }
  } catch(_e) {}

  `;

const result = html.substring(0, idx) + insertion + html.substring(idx);

// Also update the server to accept difficulty hint
fs.writeFileSync('index.html', result, 'utf-8');
console.log('Adaptive difficulty added');
