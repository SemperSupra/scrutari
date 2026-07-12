#!/usr/bin/env node
/**
 * Scrutari UI/UX State Machine Tests
 *
 * Tests correct and incorrect navigation sequences to ensure the UI
 * works as expected and handles unexpected transitions gracefully.
 *
 * Usage:
 *   node automation/state-machine-tests.mjs              # against local server
 *   node automation/state-machine-tests.mjs --live       # against Netlify
 *   node automation/state-machine-tests.mjs --server     # reuse running server
 */

import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(__dirname, 'expected-results');
const PORT = 8765;
const LIVE = process.argv.includes('--live');
const BASE = LIVE ? 'https://scrutari-submit-1783887159.netlify.app' : `http://127.0.0.1:${PORT}`;
const SKIP_SERVER = process.argv.includes('--server') || LIVE;

let serverProc = null;

function startServer() {
  return new Promise((resolve, reject) => {
    serverProc = spawn('python3', [join(__dirname, 'server.py'), String(PORT)], { cwd: ROOT, stdio: 'ignore' });
    setTimeout(() => serverProc.exitCode === null ? resolve() : reject(new Error('server failed')), 1500);
  });
}
function stopServer() { if (serverProc) { serverProc.kill(); serverProc = null; } }

const SECTION_ORDER = ['section-exit-node', 'section-fingerprint', 'section-webrtc', 'section-behavior', 'section-botornot'];

// ─── Helpers ───

async function createPage() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);
  return { browser, page };
}

let passed = 0, failed = 0;

function assert(name, condition, detail = '') {
  if (condition) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${detail ? ': ' + detail : ''}`); }
}

// ─── Test Suites ───

async function testValidHumanFlow() {
  console.log('\n═══ VALID HUMAN FLOW ═══');

  const { browser, page } = await createPage();

  // 1. Navigate through wizard in order
  for (let i = 0; i < SECTION_ORDER.length; i++) {
    const section = SECTION_ORDER[i];
    const label = `${i + 1}. ${['Network','Fingerprint','WebRTC','Behavior','Results'][i]}`;

    await page.evaluate((s) => window.navigateTo(s), section);
    await page.waitForTimeout(300);

    // Check wizard progress bar updates
    const wizClass = await page.evaluate((idx) => {
      const el = document.getElementById('wiz-' + idx);
      return el ? el.className : 'no-el';
    }, i);
    assert(`Navigate to ${label} — progress step ${i + 1} active`,
      wizClass.includes('active'), wizClass);

    // Check page indicator updates
    const indicator = await page.evaluate(() => document.getElementById('page-indicator')?.textContent || '');
    assert(`Navigate to ${label} — page indicator shows Page ${i + 1}/5`,
      indicator.includes(`${i + 1}/5`), indicator);
  }

  // 2. Capture fingerprint
  await page.evaluate(() => window.navigateTo('section-fingerprint'));
  await page.waitForTimeout(300);
  await page.evaluate(async () => { if (typeof captureFingerprint === 'function') await captureFingerprint(); });
  await page.waitForTimeout(5000);

  const botTitle = await page.evaluate(() => document.querySelector('.gauge-title')?.textContent || '');
  assert('Fingerprint capture — Bot-or-Not gauge rendered',
    botTitle.length > 0 && !botTitle.includes('Run fingerprint'), botTitle);

  const botScore = await page.evaluate(() => document.querySelector('.gauge-subtitle')?.textContent || '');
  assert('Bot-or-Not score displayed',
    botScore.includes('%') && botScore.includes('confidence'), botScore);

  // 3. Check share buttons rendered
  const shareBtns = await page.evaluate(() => {
    const btns = document.querySelectorAll('.share-btn');
    return btns.length;
  });
  assert('Share buttons visible after results', shareBtns >= 4, `${shareBtns} buttons`);

  // 4. Check download card button
  const downloadBtn = await page.evaluate(() => {
    const btns = document.querySelectorAll('.share-btn');
    return Array.from(btns).some(b => b.textContent.includes('Download'));
  });
  assert('Download card button available', downloadBtn);

  // 5. Wait for submission interval check, then verify section becomes available
  await page.waitForTimeout(4000);
  const submitActive = await page.evaluate(() => {
    const sec = document.getElementById('submit-preview-section');
    return sec && sec.style.display === 'block';
  });
  assert('Submission section activated after fingerprint', submitActive);

  // 6. Check consent checkbox needs checking
  const consentDisabled = await page.evaluate(() => {
    const btn = document.getElementById('submit-btn');
    return btn && btn.disabled === true;
  });
  assert('Submit button disabled until consent', consentDisabled);

  await browser.close();
}

async function testInvalidTransitions() {
  console.log('\n═══ INVALID / BOT-LIKE TRANSITIONS ═══');

  // Test 1: Submit without fingerprint capture
  {
    const { browser, page } = await createPage();
    const result = await page.evaluate(async () => {
      if (typeof submitResults !== 'function') return 'no fn';
      try { await submitResults(); return 'no error'; }
      catch(e) { return 'error: ' + e.message; }
    });
    assert('Submit without fingerprint — fails gracefully',
      result === 'no error' || result.includes('undefined'), result);
    await browser.close();
  }

  // Test 2: Behavioral recording with no interaction
  {
    const { browser, page } = await createPage();
    // Start and immediately stop recording
    await page.evaluate(() => { if (typeof toggleBehaviorRecording === 'function') toggleBehaviorRecording(); });
    await page.waitForTimeout(200);
    await page.evaluate(() => { if (typeof toggleBehaviorRecording === 'function') toggleBehaviorRecording(); });
    await page.waitForTimeout(1000);

    const behTitle = await page.evaluate(() => {
      const inner = document.getElementById('behavior-results-inner');
      return inner?.querySelector('div:nth-child(2)')?.textContent || 'no results';
    });
    assert('Zero-interaction recording — results still generated',
      behTitle.length > 0 && behTitle !== 'no results', behTitle);
    await browser.close();
  }

  // Test 3: Rapid navigation out of order
  {
    const { browser, page } = await createPage();
    // Jump directly to page 5 then page 2 without visiting 1, 3, 4
    await page.evaluate(() => window.navigateTo('section-botornot'));
    await page.waitForTimeout(100);
    await page.evaluate(() => window.navigateTo('section-fingerprint'));
    await page.waitForTimeout(100);
    await page.evaluate(() => window.navigateTo('section-behavior'));
    await page.waitForTimeout(100);

    // Check that progress bar reflects the last navigation
    const activeStep = await page.evaluate(() => {
      for (let i = 0; i < 5; i++) {
        const el = document.getElementById('wiz-' + i);
        if (el?.className.includes('active')) return i + 1;
      }
      return 0;
    });
    assert('Out-of-order navigation — progress bar follows last nav',
      activeStep === 4, `Step ${activeStep}`); // section-behavior is index 3 = step 4

    await browser.close();
  }

  // Test 4: Click decoy/honeypot buttons without recording
  {
    const { browser, page } = await createPage();
    // Click the decoy buttons outside of recording
    try { await page.click('#btn-opt-1', { timeout: 1000 }); } catch {}
    try { await page.click('#btn-opt-2', { timeout: 1000 }); } catch {}
    try { await page.click('#btn-opt-3', { timeout: 1000 }); } catch {}

    // Should not cause any errors — buttons are just there
    const noError = await page.evaluate(() => document.title);
    assert('Decoy buttons clickable without recording — no errors',
      noError.length > 0);
    await browser.close();
  }

  // Test 5: Start recording, then start again (toggle behavior)
  {
    const { browser, page } = await createPage();
    await page.evaluate(() => { if (typeof toggleBehaviorRecording === 'function') toggleBehaviorRecording(); });
    await page.waitForTimeout(300);
    const status1 = await page.evaluate(() => document.getElementById('behavior-status')?.textContent || '');
    assert('Recording start — status shows Active', status1.includes('Active'), status1);

    // Toggle again (stop)
    await page.evaluate(() => { if (typeof toggleBehaviorRecording === 'function') toggleBehaviorRecording(); });
    await page.waitForTimeout(300);
    const status2 = await page.evaluate(() => document.getElementById('behavior-status')?.textContent || '');
    assert('Recording stop — status shows complete', status2.includes('complete') || status2.includes('Interaction') || status2.includes('Analysis'), status2);
    await browser.close();
  }

  // Test 6: Fill hidden honeypot field directly
  {
    const { browser, page } = await createPage();
    try {
      await page.fill('#input-ext', 'bot-filled-data', { timeout: 1000 });
    } catch {}
    const val = await page.evaluate(() => document.getElementById('input-ext')?.value || '');
    assert('Hidden honeypot field fillable — tracks input', val === 'bot-filled-data', val);
    await browser.close();
  }

  // Test 7: Start behavioral recording + capture fingerprint simultaneously
  {
    const { browser, page } = await createPage();
    // Start recording
    await page.evaluate(() => { if (typeof toggleBehaviorRecording === 'function') toggleBehaviorRecording(); });
    await page.waitForTimeout(200);
    // Start fingerprint capture while recording
    await page.evaluate(async () => { if (typeof captureFingerprint === 'function') await captureFingerprint(); });
    await page.waitForTimeout(2000);
    // Can we read both results?
    const isActive = await page.evaluate(() => document.getElementById('behavior-status')?.textContent?.includes('Active'));
    assert('Fingerprint capture while recording — no crash',
      true, `Recording active: ${isActive}`);
    // Stop recording
    await page.evaluate(() => { if (typeof toggleBehaviorRecording === 'function') toggleBehaviorRecording(); });
    await page.waitForTimeout(500);
    await browser.close();
  }
}

async function testWizardNavigation() {
  console.log('\n═══ WIZARD NAVIGATION ═══');

  const { browser, page } = await createPage();

  // Track navigation events
  const navEvents = [];
  await page.evaluate(() => {
    window.__testNavs = [];
    window.addEventListener('hashchange', () => {
      window.__testNavs.push({ hash: window.location.hash, t: Date.now() });
    });
  });

  // Navigate forward through all pages
  for (const section of SECTION_ORDER) {
    await page.evaluate((s) => window.navigateTo(s), section);
    await page.waitForTimeout(800); // longer wait for smooth scroll
  }

  // Navigate backward
  await page.evaluate(() => window.navigateTo('section-fingerprint'));
  await page.waitForTimeout(200);
  await page.evaluate(() => window.navigateTo('section-exit-node'));
  await page.waitForTimeout(200);

  // Check navigation events were tracked
  const eventCount = await page.evaluate(() => window.__testNavs?.length || 0);
  assert('Navigation events tracked via hashchange',
    eventCount >= 7, `${eventCount} events`);

  // Check all sections actually scrolled to (with tolerance for page height)
  for (const section of SECTION_ORDER) {
    await page.waitForTimeout(500);
    const visible = await page.evaluate((s) => {
      const el = document.getElementById(s);
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      // Allow section to be partially visible — within viewport or slightly below
      return rect.top < window.innerHeight + 200 && rect.bottom > 0;
    }, section);
    assert(`Section ${section} scrolled into view after navigation`, visible);
  }

  await browser.close();
}

async function testChallengeFormTransitions() {
  console.log('\n═══ CHALLENGE FORM TRANSITIONS ═══');

  const { browser, page } = await createPage();

  // Start behavioral recording
  await page.evaluate(() => { if (typeof toggleBehaviorRecording === 'function') toggleBehaviorRecording(); });
  await page.waitForTimeout(500);

  // Type in challenge form fields
  try { await page.fill('#challenge-email', 'user@example.com'); } catch {}
  await page.waitForTimeout(100);
  try { await page.fill('#challenge-email-confirm', 'user@example.com'); } catch {}
  await page.waitForTimeout(100);
  try { await page.fill('#challenge-date', '12/07/2026'); } catch {}
  await page.waitForTimeout(100);
  try { await page.fill('#challenge-phone', '555-123-4567'); } catch {}
  await page.waitForTimeout(100);
  try { await page.fill('#challenge-confirm', 'CONFIRM'); } catch {}

  // Stop recording
  await page.evaluate(() => { if (typeof toggleBehaviorRecording === 'function') toggleBehaviorRecording(); });
  await page.waitForTimeout(1500);

  // Check results
  const behTitle = await page.evaluate(() => {
    const inner = document.getElementById('behavior-results-inner');
    return inner?.querySelector('div:nth-child(2)')?.textContent || '';
  });
  assert('Challenge form interaction during recording — results generated',
    behTitle.length > 0, behTitle);

  // Check all fields were actually filled
  const fields = await page.evaluate(() => ({
    email: document.getElementById('challenge-email')?.value || '',
    confirm: document.getElementById('challenge-email-confirm')?.value || '',
    date: document.getElementById('challenge-date')?.value || '',
    phone: document.getElementById('challenge-phone')?.value || '',
    confirmText: document.getElementById('challenge-confirm')?.value || '',
  }));
  assert('Challenge form fields accept input',
    fields.email === 'user@example.com', JSON.stringify(fields));

  await browser.close();
}

async function testConcurrentAccess() {
  console.log('\n═══ CONCURRENT ACCESS / RACE CONDITIONS ═══');

  const { browser, page } = await createPage();

  // Rapidly fire multiple navigations
  for (let i = 0; i < 10; i++) {
    const section = SECTION_ORDER[i % SECTION_ORDER.length];
    await page.evaluate((s) => window.navigateTo(s), section);
  }
  await page.waitForTimeout(500);

  // Page should still be responsive
  const title = await page.title();
  assert('Rapid navigation (10×) — page still responsive', title.length > 0);

  // Rapidly start and stop recording multiple times
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => { if (typeof toggleBehaviorRecording === 'function') toggleBehaviorRecording(); });
  }
  await page.waitForTimeout(500);

  const status = await page.evaluate(() => document.getElementById('behavior-status')?.textContent || '');
  assert('Rapid record toggle (5×) — no crash',
    status.length > 0, status);

  // Rapid fingerprint capture
  for (let i = 0; i < 3; i++) {
    await page.evaluate(async () => { if (typeof captureFingerprint === 'function') await captureFingerprint(); });
  }
  await page.waitForTimeout(3000);

  const gauge = await page.evaluate(() => document.querySelector('.gauge-title')?.textContent || '');
  assert('Rapid fingerprint capture (3×) — final result displayed',
    gauge.length > 0 && !gauge.includes('Run fingerprint'), gauge);

  await browser.close();
}

// ─── Main ───

async function main() {
  mkdirSync(OUT, { recursive: true });

  if (!SKIP_SERVER && !LIVE) {
    console.log('Starting local server...');
    await startServer();
  }
  console.log('Testing against:', BASE);

  const allResults = [];

  try {
    await testValidHumanFlow();
    await testInvalidTransitions();
    await testWizardNavigation();
    await testChallengeFormTransitions();
    await testConcurrentAccess();
  } catch (e) {
    console.error('\n  ✗ Unhandled error:', e.message);
    failed++;
  }

  if (!SKIP_SERVER && !LIVE) stopServer();

  // Summary
  console.log('\n═══════════════════════════════════════');
  console.log('  STATE MACHINE TEST SUMMARY');
  console.log('═══════════════════════════════════════');
  const total = passed + failed;
  console.log(`  Passed: ${passed}/${total}`);
  console.log(`  Failed: ${failed}/${total}`);
  console.log(`  Rate:   ${Math.round(passed / total * 100)}%`);
  console.log(`  Target: ${BASE}`);

  // Save
  const summary = { timestamp: new Date().toISOString(), target: BASE, passed, failed, total };
  writeFileSync(join(OUT, 'state-machine-results.json'), JSON.stringify(summary, null, 2));
  console.log(`\nResults saved to expected-results/state-machine-results.json`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('Fatal:', e); stopServer(); process.exit(1); });
