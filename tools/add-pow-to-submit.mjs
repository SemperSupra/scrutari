// Tool: Add PoW challenge-response + timing anomaly detection to index.html
// Run: node tools/add-pow-to-submit.mjs

import fs from 'fs';

const html = fs.readFileSync('index.html', 'utf-8');

// Find the LAST occurrence of the endpoint assignment line
// This is right before the fetch() call, after buildSubmissionData
const marker = "var endpoint = window.SUBMISSION_ENDPOINT || localStorage.getItem('scrutari_endpoint') || '/api/submit';";
const lastIdx = html.lastIndexOf(marker);
if (lastIdx === -1) { console.error('Marker not found'); process.exit(1); }

const injection = `  // Proof-of-Work: fetch challenge from server, compute nonce
  // Proves browser executed JavaScript (prevents replay attacks)
  // Also measures PoW timing vs hardware prediction for anomaly detection
  var _challenge = null, _nonce = null, _difficulty = 16, _challStartTime = 0;
  try {
    var chalUrl = window.SUBMISSION_ENDPOINT
      ? window.SUBMISSION_ENDPOINT.replace('/submit', '/challenge')
      : '/api/challenge';
    var challResp = await fetch(chalUrl);
    if (challResp.ok) {
      var challData = await challResp.json();
      _challenge = challData.challenge;
      _difficulty = challData.difficulty || 16;
      _challStartTime = performance.now();
      if (_challenge) {
        var _el = document.getElementById('submit-result-msg');
        if (_el) _el.innerHTML = '<span style="color:#93c5fd;">\\u23f3 Computing proof-of-work...</span>';
      }
      var _enc = new TextEncoder();
      var _maxTry = 200000;
      for (_nonce = 0; _nonce < _maxTry; _nonce++) {
        var _in = _challenge + _nonce.toString(16);
        var _buf = await crypto.subtle.digest('SHA-256', _enc.encode(_in));
        var _arr = Array.from(new Uint8Array(_buf));
        var _bits = 0;
        for (var _bi = 0; _bi < _arr.length; _bi++) {
          if (_arr[_bi] === 0) { _bits += 8; }
          else {
            var _b = _arr[_bi];
            while ((_b & 0x80) === 0) { _bits++; _b <<= 1; }
            break;
          }
        }
        if (_bits >= _difficulty) { break; }
      }
    }
    // PoW timing analysis: compare actual vs expected based on hardware profile
    var _powEndTime = performance.now();
    data._powTiming = {
      actualMs: Math.round((_powEndTime - _challStartTime) * 10) / 10,
      nonce: _nonce < _maxTry ? _nonce : null,
      difficulty: _difficulty,
      maxAttempts: _maxTry,
      hardware: {
        cores: navigator.hardwareConcurrency || null,
        memory: navigator.deviceMemory || null,
        platform: navigator.platform || '',
      }
    };
    // Expected time model: baseline 500ms on a reference 4-core machine
    // Scaled by hardware concurrency (more cores = faster per attempt)
    // Scaled by device memory (more RAM = less contention)
    // Scaled by platform (ARM macOS is faster than x64 Windows for crypto)
    var _refCores = 4, _refMs = 500;
    var _coreScale = (navigator.hardwareConcurrency || _refCores) > 0
      ? _refCores / (navigator.hardwareConcurrency || _refCores) : 1.0;
    var _memScale = 1.0;
    if (navigator.deviceMemory && navigator.deviceMemory > 0) {
      _memScale = 8 / navigator.deviceMemory;
    }
    var _platScale = 1.0;
    var _plat = (navigator.platform || '').toLowerCase();
    if (_plat.includes('mac')) _platScale = 0.7;
    else if (_plat.includes('win')) _platScale = 1.2;
    else if (_plat.includes('linux')) _platScale = 1.5;
    data._powTiming.expectedMs = Math.round(_refMs * _coreScale * _memScale * _platScale * 10) / 10;
    if (data._powTiming.actualMs > 0 && data._powTiming.expectedMs > 0) {
      data._powTiming.anomalyRatio = Math.round((data._powTiming.actualMs / data._powTiming.expectedMs) * 100) / 100;
      // Ratio > 3 = 3x slower than expected (VM/container/overloaded)
      // Ratio < 0.3 = 3x faster than expected (accelerator/GPU/ASIC)
      data._powTiming.anomalyDetected = data._powTiming.anomalyRatio > 3 || data._powTiming.anomalyRatio < 0.3;
    }
  } catch(_e) {}
  // Attach PoW proof to submission if we have one
  if (_challenge && _nonce !== null) {
    data.challenge = _challenge;
    data.nonce = _nonce;
    data.difficulty = _difficulty;
  }

  `;

const result = html.substring(0, lastIdx) + injection + html.substring(lastIdx);
fs.writeFileSync('index.html', result, 'utf-8');
console.log('PoW + timing anomaly detection complete');
