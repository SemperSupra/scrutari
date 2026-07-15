// Tool: Deduplicate SPA code in index.html
// Extracts the active (3rd) copy's JS into js/scrutari.js
// Strips dead copies (1 & 2) and the PowerShell artifact
//
// Usage: node tools/dedup-spa.mjs

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');
const OUT_JS = path.join(ROOT, 'js', 'scrutari.js');

// Read the full file
const html = fs.readFileSync(INDEX, 'utf-8');
const lines = html.split('\n');
console.log(`Total lines: ${lines.length}`);

// === Step 1: Identify copy boundaries ===
// Copy 1: lines 0-2145 (first DOCTYPE at line 0, second DOCTYPE at line 2146)
// Copy 2: lines 2146-5231 (second DOCTYPE at line 2146, third at line 5232)
// Copy 3: lines 5232+ (third DOCTYPE at line 5232)

const copy2Start = html.indexOf('<!DOCTYPE html>', 10); // second DOCTYPE
const copy3Start = html.indexOf('<!DOCTYPE html>', copy2Start + 10); // third DOCTYPE

console.log(`Copy 2 DOCTYPE at offset ${copy2Start}`);
console.log(`Copy 3 DOCTYPE at offset ${copy3Start}`);

// Find the corresponding line numbers
function lineFromOffset(offset) {
  return html.substring(0, offset).split('\n').length - 1;
}

const c2Line = lineFromOffset(copy2Start);
const c3Line = lineFromOffset(copy3Start);
console.log(`Copy 2 starts at line ${c2Line}, Copy 3 starts at line ${c3Line}`);

// === Step 2: Find the end of copy 3 ===
// Look for the last </html> in the file
const lastHtmlEnd = html.lastIndexOf('</html>');
const lastHtmlLine = lineFromOffset(lastHtmlEnd);
console.log(`Last </html> at line ${lastHtmlLine}`);

// === Step 3: Extract copy 3 HTML ===
const copy3Lines = lines.slice(c3Line, lastHtmlLine + 1);
const copy3Html = copy3Lines.join('\n');
console.log(`Copy 3: ${copy3Lines.length} lines`);

// === Step 4: Fix the ` = ` artifact at the start of copy 3 ===
let cleanedCopy3 = copy3Html;
if (cleanedCopy3.startsWith(' = <!')) {
  cleanedCopy3 = '<!' + cleanedCopy3.substring(4);
  console.log('Fixed ` = <!` artifact at copy 3 start');
}

// === Step 5: Extract JS from script blocks in copy 3 ===
// Find all <script> blocks (not type="application/ld+json")
const scriptRegex = /<script>(?!\s*\{[\s\S]*?\}\s*<\/script>)([\s\S]*?)<\/script>/g;
const jsonldRegex = /<script type="application\/ld\+json">[\s\S]*?<\/script>/g;

// Remove JSON-LD blocks first for cleaner extraction
let jsExtract = cleanedCopy3.replace(jsonldRegex, '');

// Extract all script contents
const allScripts = [];
let match;
const genericScriptRegex = /<script>([\s\S]*?)<\/script>/g;
while ((match = genericScriptRegex.exec(jsExtract)) !== null) {
  const code = match[1].trim();
  if (code.length > 0 && !code.startsWith('{')) { // skip JSON-LD remnants
    allScripts.push(code);
    console.log(`Found script block: ${code.substring(0, 60)}... (${code.length} chars)`);
  }
}

// Combine all scripts
const combinedJS = allScripts.join('\n\n');
console.log(`\nCombined JS: ${combinedJS.length} chars`);

// === Step 6: Remove the PowerShell .Replace() artifact ===
// The artifact starts after </html> in copy 2, before copy 3's real content
// Check for it and warn
if (cleanedCopy3.includes('.Replace(')) {
  console.warn('WARNING: PowerShell .Replace() artifact found in copy 3!');
  console.warn('This needs manual cleanup. The artifact is NOT valid JS.');
  // Remove anything that looks like a .Replace() call
  cleanedCopy3 = cleanedCopy3.replace(/\.Replace\("[\s\S]*?\);?/g, '/* REMOVED: PowerShell artifact */');
}

// === Step 7: Also check the combined JS for invalid syntax ===
// Look for lines that aren't valid JS
const jsLines = combinedJS.split('\n');
const suspiciousLines = jsLines
  .map((l, i) => ({ line: i + 1, text: l }))
  .filter(l => {
    const t = l.text.trim();
    return t.startsWith('.Replace(') || t.startsWith('@"') || t.startsWith("'@");
  });

if (suspiciousLines.length > 0) {
  console.warn(`\nWARNING: ${suspiciousLines.length} suspicious line(s) in extracted JS:`);
  suspiciousLines.forEach(l => console.warn(`  Line ${l.line}: ${l.text.substring(0, 80)}`));
}

// === Step 8: Write the JS file ===
const jsDir = path.dirname(OUT_JS);
if (!fs.existsSync(jsDir)) {
  fs.mkdirSync(jsDir, { recursive: true });
  console.log(`Created directory: ${jsDir}`);
}

fs.writeFileSync(OUT_JS, combinedJS, 'utf-8');
console.log(`\nWrote JS to: ${OUT_JS}`);

// === Step 9: Build the new index.html ===
// Replace inline scripts with external reference in copy 3
let newHtml = cleanedCopy3;

// Replace the first <script> block (main JS) with external script tag
// and remove any subsequent <script> blocks (their content is now merged)
let scriptCount = 0;
newHtml = newHtml.replace(/<script>([\s\S]*?)<\/script>/g, (match, code) => {
  const trimmed = code.trim();
  if (trimmed.length === 0) return match; // keep empty scripts
  if (trimmed.startsWith('{')) return match; // skip JSON-LD
  scriptCount++;
  if (scriptCount === 1) {
    // First script block → external reference
    return '<script src="/js/scrutari.js" defer></script>';
  }
  // Subsequent script blocks → remove, their content is merged
  return '';
});

// Remove any JSON-LD artifact scripts (the { } blocks aren't valid JSON-LD)
newHtml = newHtml.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '');

// Ensure there's a single external script reference
if (!newHtml.includes('src="/js/scrutari.js"')) {
  // Insert before </head>
  newHtml = newHtml.replace('</head>', '  <script src="/js/scrutari.js" defer></script>\n</head>');
}

// === Step 10: Write the new index.html ===
const backupPath = INDEX + '.bak';
fs.writeFileSync(backupPath, html, 'utf-8');
console.log(`Backup written to: ${backupPath}`);

fs.writeFileSync(INDEX, newHtml, 'utf-8');
console.log(`\nNew index.html written: ${newHtml.length} chars (was ${html.length} chars, ${((1 - newHtml.length/html.length)*100).toFixed(1)}% reduction)`);

// === Step 11: Verify JS parses correctly ===
try {
  new Function(combinedJS);
  console.log('✅ Extracted JS parses successfully');
} catch (e) {
  console.error('❌ Extracted JS FAILS to parse:', e.message);
  process.exit(1);
}

console.log('\n=== DONE ===');
console.log(`Run: git diff --stat to verify changes`);
console.log(`Test: node --test test/*.test.mjs`);
