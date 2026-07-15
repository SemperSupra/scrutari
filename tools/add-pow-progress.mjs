import fs from 'fs';

const html = fs.readFileSync('index.html', 'utf-8');

// Add progress feedback to PoW challenge computation
const marker = 'for (_nonce = 0; _nonce < _maxTry; _nonce++) {';
const lastIdx = html.lastIndexOf(marker);
if (lastIdx === -1) { console.error('Marker not found'); process.exit(1); }

const newLoop = `for (_nonce = 0; _nonce < _maxTry; _nonce++) {
        if (_nonce % 20000 === 0 && _nonce > 0) {
          var _pp = Math.round(_nonce / _maxTry * 100);
          var _pe = document.getElementById('submit-result-msg');
          if (_pe) _pe.innerHTML = '<span style="color:#93c5fd;">\\u23f3 Computing proof-of-work... ' + _pp + '%</span>';
        }`;

const result = html.substring(0, lastIdx) + newLoop + html.substring(lastIdx + marker.length);
fs.writeFileSync('index.html', result, 'utf-8');
console.log('PoW progress feedback added');
