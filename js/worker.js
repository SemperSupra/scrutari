// Scrutari Web Worker
// Offloads CPU-intensive operations from the main thread:
//   1. PoW computation (SHA-256 hash search)
//   2. Canvas fingerprint hashing (SHA-256 of pixel data)
//   3. BigInt performance benchmark
//
// Web Crypto API (crypto.subtle) is available in all modern dedicated workers.

// ─── SHA-256 helper ───
async function sha256Hex(input) {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(input));
  const hashArray = new Uint8Array(hashBuffer);
  let hex = '';
  for (let i = 0; i < hashArray.length; i++) {
    hex += hashArray[i].toString(16).padStart(2, '0');
  }
  return hex;
}

// Count leading zero bits in a hex string
function leadingZeroBits(hex) {
  let count = 0;
  for (let i = 0; i < hex.length; i++) {
    const c = hex[i];
    if (c === '0') { count += 4; continue; }
    const val = parseInt(c, 16);
    if (val === 0) count += 4;
    else if (val < 8) count += 3;
    else if (val < 4) count += 2;
    else if (val < 2) count += 1;
    break;
  }
  return count;
}

// ─── Message handler ───
self.onmessage = async function(e) {
  const msg = e.data;

  switch (msg.type) {
    // ── PoW computation ──
    case 'pow': {
      const { challenge, difficulty, maxAttempts, id } = msg;
      const targetZeros = parseInt(difficulty, 10) || 16;
      const maxN = parseInt(maxAttempts, 10) || 50000;
      const start = performance.now();
      let result = null;

      for (let nonce = 0; nonce < maxN; nonce++) {
        const input = challenge + nonce.toString(16);
        const hex = await sha256Hex(input);
        if (leadingZeroBits(hex) >= targetZeros) {
          result = nonce;
          break;
        }
        // Yield to the event loop every 1000 iterations to stay responsive
        if (nonce > 0 && nonce % 1000 === 0) {
          await new Promise(r => setTimeout(r, 0));
        }
      }

      const elapsed = performance.now() - start;
      self.postMessage({
        type: 'pow-result',
        id: id || 0,
        nonce: result,
        time: elapsed,
        found: result !== null,
        speed: maxN / (elapsed / 1000),
      });
      break;
    }

    // ── Canvas hash computation ──
    case 'canvas-hash': {
      const { imageData, id } = msg;
      // Compute SHA-256 of the raw pixel data for a stable hash
      const encoder = new TextEncoder();
      const pixelStr = JSON.stringify(Array.from(imageData.data.slice(0, 256)));
      const hex = await sha256Hex(pixelStr);
      self.postMessage({
        type: 'canvas-hash-result',
        id: id || 0,
        hash: hex,
        bytes: imageData.data.length,
      });
      // The ImageData buffer is transferred back automatically
      break;
    }

    // ── BigInt performance benchmark ──
    case 'bigint-bench': {
      const { id } = msg;
      const start = performance.now();
      let result = 0;
      for (let i = 0; i < 10000; i++) {
        result += BigInt(Math.floor(Math.random() * 1000000));
      }
      const elapsed = performance.now() - start;
      self.postMessage({
        type: 'bigint-bench-result',
        id: id || 0,
        time: elapsed,
      });
      break;
    }

    // ── Environment probe ──
    case 'worker-env': {
      const { id } = msg;
      const env = {
        // Worker availability and identity
        workerSupported: true,
        workerAgent: navigator.userAgent || null,
        workerPlatform: navigator.platform || null,
        workerLanguage: navigator.language || null,
        workerCores: navigator.hardwareConcurrency || null,
        workerOnLine: typeof navigator.onLine !== 'undefined' ? navigator.onLine : null,

        // Timer precision in worker context
        workerTimerPrecision: (function() {
          var t1 = performance.now();
          var t2 = performance.now();
          return (t2 - t1) > 0 ? (t2 - t1) : 0;
        })(),

        // Whether crypto.subtle is accessible (should be, but bots may block)
        cryptoSubtleAvailable: typeof crypto.subtle !== 'undefined',

        // Location data (worker has restricted location)
        workerLocation: typeof self.location !== 'undefined' ? self.location.href : null,

        // Worker identity — some automation frameworks inject unique identifiers
        workerKeys: Object.keys(self).filter(function(k) {
          return k.startsWith('__') || k.startsWith('_');
        }),
      };
      self.postMessage({ type: 'worker-env-result', id: id || 0, env: env });
      break;
    }

    // ── Timer drift measurement ──
    case 'timer-drift': {
      const { id } = msg;
      var t0 = performance.now();
      setTimeout(function() {
        var drift = performance.now() - t0 - 100; // expected 100ms
        self.postMessage({ type: 'timer-drift-result', id: id || 0, drift: drift, elapsed: performance.now() - t0 });
      }, 100);
      break;
    }

    // ── Transferable test ──
    case 'transfer-test': {
      // Simply echo back that we received the transferable buffer
      self.postMessage({ type: 'transfer-test-result', id: msg.id || 0, received: msg.buf ? msg.buf.byteLength : 0 });
      break;
    }

    default:
      self.postMessage({ type: 'error', error: 'Unknown message type: ' + msg.type });
  }
};
