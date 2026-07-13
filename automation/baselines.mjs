#!/usr/bin/env node
/**
 * Scrutari Bot-or-Not Baseline Collection
 *
 * Runs the Scrutari SPA through multiple browser configurations,
 * captures the Bot-or-Not rating, and saves results.
 *
 * Configurations tested:
 *   - Headless Chrome (default / no-gpu / mobile / desktop)
 *   - Headless Firefox
 *   - Headless WebKit
 *
 * Usage:
 *   node automation/baselines.mjs              # run all
 *   node automation/baselines.mjs --server     # reuse running server
 *   node automation/baselines.mjs --headed     # also headed tests
 */

import { chromium, firefox, webkit } from 'playwright';
import { spawn } from 'child_process';
import { writeFileSync, readFileSync, readdirSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(__dirname, 'expected-results');
const PORT = 8765;
const BASE = `http://127.0.0.1:${PORT}`;
const HEADED = process.argv.includes('--headed');
const SKIP_SERVER = process.argv.includes('--server');

let serverProc = null;

function startServer() {
  return new Promise((resolve, reject) => {
    serverProc = spawn('python3', [join(__dirname, 'server.py'), String(PORT)], {
      cwd: ROOT, stdio: 'ignore'
    });
    setTimeout(() => serverProc.exitCode === null ? resolve() : reject(), 1500);
  });
}
function stopServer() { if (serverProc) { serverProc.kill(); serverProc = null; } }

/**
 * Navigate to the page normally (no ?format=json), click "Capture Fingerprint",
 * wait for all async tests to complete, then extract results from the DOM.
 */
async function captureFromPage(page) {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 20000 });
  // Wait a bit for the page to fully initialize
  await page.waitForTimeout(1000);

  // Set submission source so automated data is labeled in the research dataset
  await page.evaluate(() => { window.__SUBMISSION_SOURCE = 'automation_playwright'; });

  // Instead of relying on button clicks (which may not work in headless),
  // call captureFingerprint() directly in the page context.
  // This also avoids timing issues with the button being visible.
  const ran = await page.evaluate(async () => {
    if (typeof captureFingerprint === 'function') {
      await captureFingerprint();
      return true;
    }
    return false;
  });

  // Auto-submit anonymized data to research endpoint
  await page.evaluate(async () => {
    if (typeof submitResults === 'function' && typeof __lastFingerprintData !== 'undefined' && __lastFingerprintData) {
      // Don't fail the test if submission fails (endpoint may not be deployed)
      try { await submitResults(); } catch(e) {}
    }
  });

  if (!ran) {
    // Fallback: try clicking the button
    try {
      await page.locator('button:has-text("Capture Fingerprint")').click();
      await page.waitForTimeout(500);
      const r2 = await page.evaluate(() => typeof captureFingerprint === 'function');
      if (!r2) throw new Error('captureFingerprint not found');
    } catch (e) {
      throw new Error('Failed to run fingerprint capture: ' + e.message);
    }
  }

  // Wait for async fingerprinting (PoW benchmark takes ~5-8s, battery/storage are async)
  await page.waitForTimeout(10000);

  // Extract fingerprint data from the rendered grid
  const rawFp = await page.evaluate(() => {
    const items = document.querySelectorAll('#fingerprint-grid .stat-box');
    const fp = {};
    items.forEach(el => {
      const label = el.querySelector('.stat-label')?.textContent;
      const value = el.querySelector('.stat-value')?.textContent;
      if (label) fp[label] = value;
    });
    // Add navigator-level properties the grid doesn't expose
    fp['_webdriver'] = navigator.webdriver;
    fp['_pluginsLen'] = navigator.plugins ? navigator.plugins.length : -1;
    fp['_languages'] = navigator.languages ? Array.from(navigator.languages).join(',') : '';
    fp['_deviceMemory'] = navigator.deviceMemory;
    fp['_hardwareConcurrency'] = navigator.hardwareConcurrency;
    fp['_historyLen'] = window.history.length;
    fp['_pdfViewer'] = navigator.pdfViewerEnabled;
    fp['_cookieEnabled'] = navigator.cookieEnabled;

    // Collect the Bot-or-Not gauge content if available
    const botEl = document.getElementById('botornot-results');
    const gaugeTitle = botEl?.querySelector('.gauge-title')?.textContent || '';
    const gaugeSubtitle = botEl?.querySelector('.gauge-subtitle')?.textContent || '';
    fp['_botGaugeTitle'] = gaugeTitle;
    fp['_botGaugeSubtitle'] = gaugeSubtitle;

    // Compute Bot-or-Not rating using the page's own function
    // Function declarations in scripts are on the global scope but might not
    // show up on window. Check both.
    const bonFn = typeof computeBotOrNot === 'function' ? computeBotOrNot
               : typeof window.computeBotOrNot === 'function' ? window.computeBotOrNot
               : null;
    let bon = null;
    if (bonFn) {
      bon = bonFn(fp);
    } else {
      fp['_bonError'] = 'computeBotOrNot not found in page context';
    }
    return { fp, bon };
  });

  return rawFp;
}

function saveResult(name, data) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const slug = name.replace(/[^a-z0-9-]/gi, '_').toLowerCase();
  const out = {
    test: name,
    timestamp,
    userAgent: data?.fp?.['User Agent'] || 'unknown',
    platform: data?.fp?.Platform || 'unknown',
    botOrNot: data?.bon || null,
    fingerprint: data?.fp || {},
    totalEntropyBits: null,
  };
  writeFileSync(join(OUT, `${slug}.json`), JSON.stringify(out, null, 2));
  const botPct = data?.bon?.botProbability;
  const conf = data?.bon?.confidence || '?';
  console.log(`    Bot-or-Not: ${botPct !== undefined ? botPct + '%' : 'N/A'} (${conf})`);
  console.log(`    ✓ saved → ${slug}.json`);
}

// ─── Test configurations ───

const TESTS = [];

// Chromium variations
TESTS.push({
  name: 'Headless Chrome (default)',
  run: async () => {
    const b = await chromium.launch({ headless: true });
    const ctx = await b.newContext();
    const page = await ctx.newPage();
    const r = await captureFromPage(page);
    await b.close();
    return r;
  }
});

TESTS.push({
  name: 'Headless Chrome (no GPU)',
  run: async () => {
    const b = await chromium.launch({ headless: true, args: ['--disable-gpu'] });
    const ctx = await b.newContext();
    const page = await ctx.newPage();
    const r = await captureFromPage(page);
    await b.close();
    return r;
  }
});

TESTS.push({
  name: 'Chrome Windows desktop',
  run: async () => {
    const b = await chromium.launch({ headless: true });
    const ctx = await b.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      locale: 'en-US', timezoneId: 'America/New_York',
    });
    const page = await ctx.newPage();
    const r = await captureFromPage(page);
    await b.close();
    return r;
  }
});

TESTS.push({
  name: 'Chrome mobile (Pixel 5)',
  run: async () => {
    const b = await chromium.launch({ headless: true });
    const ctx = await b.newContext({
      viewport: { width: 393, height: 851 },
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.71 Mobile Safari/537.36',
      isMobile: true, hasTouch: true, locale: 'en-US',
    });
    const page = await ctx.newPage();
    const r = await captureFromPage(page);
    await b.close();
    return r;
  }
});

TESTS.push({
  name: 'Chrome macOS desktop',
  run: async () => {
    const b = await chromium.launch({ headless: true });
    const ctx = await b.newContext({
      viewport: { width: 1512, height: 982 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      locale: 'en-US', timezoneId: 'America/Los_Angeles',
    });
    const page = await ctx.newPage();
    const r = await captureFromPage(page);
    await b.close();
    return r;
  }
});

// Firefox
TESTS.push({
  name: 'Headless Firefox (default)',
  run: async () => {
    const b = await firefox.launch({ headless: true });
    const ctx = await b.newContext();
    const page = await ctx.newPage();
    const r = await captureFromPage(page);
    await b.close();
    return r;
  }
});

// WebKit
TESTS.push({
  name: 'Headless WebKit (default)',
  run: async () => {
    const b = await webkit.launch({ headless: true });
    const ctx = await b.newContext();
    const page = await ctx.newPage();
    const r = await captureFromPage(page);
    await b.close();
    return r;
  }
});

if (HEADED) {
  TESTS.push({
    name: 'Headed Chrome',
    run: async () => {
      const b = await chromium.launch({ headless: false });
      const ctx = await b.newContext();
      const page = await ctx.newPage();
      const r = await captureFromPage(page);
      await b.close();
      return r;
    }
  });
}

// ─── main ───

async function main() {
  mkdirSync(OUT, { recursive: true });

  if (!SKIP_SERVER) {
    console.log('Starting test server...');
    await startServer();
    console.log('Server ready on port', PORT);
  }

  for (const test of TESTS) {
    console.log(`\n▶ ${test.name}`);
    try {
      const result = await test.run();
      saveResult(test.name, result);
    } catch (err) {
      console.error(`  ✗ Error: ${err.message}`);
    }
  }

  // ─── Behavioral tests ───
  console.log('\n═══════════════════════════════════════');
  console.log('  BEHAVIORAL TESTS (honeypots, forms, mouse)');
  console.log('═══════════════════════════════════════');

  const behavioralTests = [
    { name: 'Bot behavioral (headless Chrome)', behavior: 'bot', engine: chromium },
    { name: 'Human-like behavioral (headless Chrome)', behavior: 'human', engine: chromium },
  ];

  for (const bt of behavioralTests) {
    console.log(`\n▶ ${bt.name}`);
    try {
      const browser = await bt.engine.launch({ headless: true });
      const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
      const page = await ctx.newPage();
      await page.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(500);

      // Set submission source so automated data is labeled
      // Use specific ground truth label: automation_playwright (known bot type)
      await page.evaluate(() => { window.__SUBMISSION_SOURCE = 'automation_playwright'; });

      // Also capture fingerprint + Bot-or-Not for submission data
      await page.evaluate(async () => { if (typeof captureFingerprint === 'function') await captureFingerprint(); });
      await page.waitForTimeout(2000);

      // Start behavioral recording
      await page.evaluate(() => { if (typeof toggleBehaviorRecording === 'function') toggleBehaviorRecording(); });
      await page.waitForTimeout(200);
      // Extend recording duration for human test (must happen AFTER startBehaviorRecording creates the object)
      if (bt.behavior === 'human') {
        await page.evaluate(() => { __behavior.duration = 45000; });
        // Also clear and reset the auto-stop timeout
        await page.evaluate(() => {
          clearTimeout(__behavior.timeout);
          __behavior.timeout = setTimeout(stopBehaviorRecording, 45000);
        });
      }
      await page.waitForTimeout(300);

      if (bt.behavior === 'bot') {
        // Simulate bot behavior
        // 1. Click all the buttons (including decoys)
        await page.click('#btn-opt-1', { timeout: 1000 }).catch(() => {});
        await page.waitForTimeout(50);
        await page.click('#btn-opt-2', { timeout: 1000 }).catch(() => {});
        await page.waitForTimeout(50);
        await page.click('#btn-opt-3', { timeout: 1000 }).catch(() => {});
        await page.waitForTimeout(50);
        await page.click('#btn-primary', { timeout: 1000 }).catch(() => {});
        await page.waitForTimeout(50);
        // 2. Fill the hidden honeypot field
        const hp = page.locator('#input-ext');
        await hp.fill('scraped by bot', { timeout: 1000 }).catch(() => {});
        await page.waitForTimeout(50);
        // 3. Type in fields instantly (no delay = programmatic)
        await page.fill('#input-main', 'automated fill test data', { timeout: 1000 }).catch(() => {});
        await page.waitForTimeout(50);
        await page.fill('#input-email', 'bot@example.com', { timeout: 1000 }).catch(() => {});
        await page.waitForTimeout(50);
        // 4. No scrolling, no mouse movement (bot-like)
      } else {
        // Simulate human-like behavior
        // 1. Navigate through wizard pages in order (humans follow UI flow)
        await page.evaluate(() => navigateTo('section-exit-node'));
        await page.waitForTimeout(400 + Math.floor(Math.random() * 500));
        await page.evaluate(() => navigateTo('section-fingerprint'));
        await page.waitForTimeout(300 + Math.floor(Math.random() * 400));
        await page.evaluate(() => navigateTo('section-webrtc'));
        await page.waitForTimeout(200 + Math.floor(Math.random() * 300));
        // Go back to fingerprint (human re-checking something)
        await page.evaluate(() => navigateTo('section-fingerprint'));
        await page.waitForTimeout(300 + Math.floor(Math.random() * 300));
        await page.evaluate(() => navigateTo('section-behavior'));
        await page.waitForTimeout(400);

        // 2. Mouse movement — more moves with noisy paths and varied speed
        for (let step = 0; step < 20; step++) {
          const x = 100 + Math.floor(Math.random() * 700);
          const y = 100 + Math.floor(Math.random() * 700);
          // Use more steps for slower, more natural-looking movement
          const steps = 10 + Math.floor(Math.random() * 15);
          await page.mouse.move(x + (Math.random() - 0.5) * 20,
                                y + (Math.random() - 0.5) * 20, { steps });
          await page.waitForTimeout(80 + Math.floor(Math.random() * 250));
        }
        // 2. More scrolling with natural reading pauses
        for (let s = 0; s < 3; s++) {
          await page.evaluate(() => window.scrollBy({ top: 200 + Math.floor(Math.random() * 200), behavior: 'smooth' }));
          await page.waitForTimeout(600 + Math.floor(Math.random() * 900));
        }
        // 3. Scroll back up a bit (humans re-scan)
        await page.evaluate(() => window.scrollBy({ top: -120, behavior: 'smooth' }));
        await page.waitForTimeout(500 + Math.floor(Math.random() * 300));
        // 4. Click only the normal button
        await page.mouse.move(280, 350, { steps: 12 });
        await page.waitForTimeout(150 + Math.floor(Math.random() * 200));
        await page.click('#btn-primary', { timeout: 1000 }).catch(() => {});
        await page.waitForTimeout(400 + Math.floor(Math.random() * 300));
        // 5. Type in first field with varied delay (human-like: pauses vary)
        await page.mouse.move(200, 220, { steps: 10 });
        await page.waitForTimeout(200 + Math.floor(Math.random() * 300));
        await page.click('#input-main', { timeout: 1000 }).catch(() => {});
        await page.waitForTimeout(300 + Math.floor(Math.random() * 400));
        // Type with variable delay — humans average 120ms between keystrokes
        const text = 'hello there, this is a human typing test';
        for (const char of text) {
          await page.type('#input-main', char, { delay: 60 + Math.floor(Math.random() * 180) });
          // Occasionally pause longer (like thinking)
          if (Math.random() < 0.08) await page.waitForTimeout(400 + Math.floor(Math.random() * 600));
        }
        await page.waitForTimeout(200);
        // 6. Make a typing correction (humans backspace sometimes)
        await page.type('#input-main', ' and', { delay: 70 + Math.floor(Math.random() * 120) });
        await page.waitForTimeout(150);
        // Oops, wrong word — backspace!
        await page.keyboard.press('Backspace');
        await page.keyboard.press('Backspace');
        await page.keyboard.press('Backspace');
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(200 + Math.floor(Math.random() * 300));
        // Continue with corrected text
        for (const char of ' plus more text with varied timing') {
          await page.type('#input-main', char, { delay: 50 + Math.floor(Math.random() * 160) });
        }
        await page.waitForTimeout(300);
        // 7. Tab to email field (humans use tab between fields) then type with natural pause
        await page.keyboard.press('Tab');
        await page.waitForTimeout(200 + Math.floor(Math.random() * 300));
        // Oops, tab went too far — shift+tab back
        await page.keyboard.press('Shift');
        await page.keyboard.press('Tab');
        await page.keyboard.up('Shift');
        await page.waitForTimeout(150 + Math.floor(Math.random() * 200));
        // Now forward to email
        await page.keyboard.press('Tab');
        await page.waitForTimeout(250 + Math.floor(Math.random() * 300));
        const email = 'user' + Math.floor(Math.random() * 100) + '@example.com';
        for (const char of email) {
          await page.type('#input-email', char, { delay: 40 + Math.floor(Math.random() * 140) });
        }
        await page.waitForTimeout(100);
        // 8. Add typing corrections — backspace a word and retype (humans make errors)
        await page.waitForTimeout(300 + Math.floor(Math.random() * 400));
        await page.click('#input-main', { timeout: 1000 }).catch(() => {});
        await page.waitForTimeout(200);
        // Type a wrong word, then correct it
        for (const char of 'worng word') {
          await page.type('#input-main', char, { delay: 40 + Math.floor(Math.random() * 120) });
        }
        await page.waitForTimeout(200);
        // Backspace the wrong word
        for (let b = 0; b < 10; b++) {
          await page.keyboard.press('Backspace');
          await page.waitForTimeout(30 + Math.floor(Math.random() * 100));
        }
        await page.waitForTimeout(200 + Math.floor(Math.random() * 300));
        // Retype correctly
        for (const char of 'wrong word, fixed it') {
          await page.type('#input-main', char, { delay: 30 + Math.floor(Math.random() * 150) });
        }
        await page.waitForTimeout(200);
        // 9. Simulate tab switches (humans switch tabs occasionally)
        // Dispatch focus/blur events to trigger the behavioral tracker
        await page.evaluate(() => window.dispatchEvent(new Event('blur')));
        await page.waitForTimeout(600 + Math.floor(Math.random() * 600));
        await page.evaluate(() => window.dispatchEvent(new Event('focus')));
        await page.waitForTimeout(200 + Math.floor(Math.random() * 200));
        // 10. Resize window + fire resize event (headless needs manual dispatch)
        await page.setViewportSize({ width: 1800, height: 900 });
        await page.evaluate(() => window.dispatchEvent(new Event('resize')));
        await page.waitForTimeout(150 + Math.floor(Math.random() * 200));
        await page.setViewportSize({ width: 1400, height: 800 });
        await page.evaluate(() => window.dispatchEvent(new Event('resize')));
        await page.waitForTimeout(100 + Math.floor(Math.random() * 150));
        await page.setViewportSize({ width: 1920, height: 1050 });
        await page.evaluate(() => window.dispatchEvent(new Event('resize')));
        await page.waitForTimeout(100);
        // 11. Challenge form with deliberate typos (humans make mistakes)
        await page.mouse.move(200, 500, { steps: 8 });
        await page.waitForTimeout(200 + Math.floor(Math.random() * 300));
        // Email — type wrong email, correct it
        await page.click('#challenge-email').catch(()=>{}); await page.waitForTimeout(200);
        for (const ch of 'humen@exmple') { await page.type('#challenge-email', ch, {delay:40+Math.random()*100}); }
        await page.waitForTimeout(100);
        for (let b=0; b<4; b++) { await page.keyboard.press('Backspace'); await page.waitForTimeout(30+Math.random()*80); }
        await page.waitForTimeout(100);
        for (const ch of 'uman@example.com') { await page.type('#challenge-email', ch, {delay:30+Math.random()*120}); }
        await page.waitForTimeout(150);
        // Date — type wrong format, correct it
        await page.click('#challenge-date').catch(()=>{}); await page.waitForTimeout(150);
        // Type DD/MM (wrong for US), correct to MM/DD
        for (const ch of '13/07/2026') { await page.type('#challenge-date', ch, {delay:30+Math.random()*100}); }
        await page.waitForTimeout(200);
        // Realize format is wrong, retype
        for (let b=0; b<10; b++) { await page.keyboard.press('Backspace'); await page.waitForTimeout(20+Math.random()*60); }
        await page.waitForTimeout(200);
        for (const ch of '07/13/2026') { await page.type('#challenge-date', ch, {delay:30+Math.random()*100}); }
        await page.waitForTimeout(100);
        // 12. Fire zoom/resolution event (tracked by matchMedia listener)
        await page.evaluate(() => {
          if (typeof __trackZoom === 'function') __trackZoom();
        });
        await page.waitForTimeout(50);
        // 13. Scroll one more time (human checking their work)
        await page.evaluate(() => window.scrollBy({ top: 100, behavior: 'smooth' }));
        await page.waitForTimeout(300);
        // 14. Do NOT touch honeypot field or decoy buttons
      }

      // Stop recording — click the stop button
      await page.evaluate(() => { if (typeof toggleBehaviorRecording === 'function') toggleBehaviorRecording(); });
      await page.waitForTimeout(1500);

      // Extract behavioral results from the analysis engine directly
      const fullResult = await page.evaluate(() => {
        if (typeof __lastBehaviorResult !== 'undefined') return __lastBehaviorResult;
        return { error: '__lastBehaviorResult not found', botProbability: null, signals: [], eventCount: {} };
      });

      await browser.close();

      const saved = {
        test: bt.name,
        timestamp: new Date().toISOString(),
        behavioralScore: fullResult?.botProbability,
        behavioralTitle: fullResult?.botProbability !== null
          ? (fullResult.botProbability <= 15 ? 'Human-like Behavior' :
             fullResult.botProbability <= 35 ? 'Mostly Human' :
             fullResult.botProbability <= 55 ? 'Uncertain' :
             fullResult.botProbability <= 80 ? 'Bot-like Behavior' : 'Automated Behavior')
          : 'N/A',
        behavioralEvents: fullResult?.eventCount
          ? `Events: ${fullResult.eventCount.mouse||0} mouse, ${fullResult.eventCount.scroll||0} scroll, ${fullResult.eventCount.clicks||0} clicks, ${fullResult.eventCount.keys||0} keys${fullResult.eventCount.input ? ', '+fullResult.eventCount.input+' input' : ''}`
          : '',
        signals: fullResult?.signals || [],
      };
      const slug = bt.name.replace(/[^a-z0-9-]/gi, '_').toLowerCase();
      writeFileSync(join(OUT, `${slug}.json`), JSON.stringify(saved, null, 2));
      console.log(`    Behavioral score: ${fullResult?.botProbability !== null && fullResult?.botProbability !== undefined ? fullResult.botProbability + '% bot' : 'N/A'}`);
      if (fullResult?.eventCount) {
        const ev = fullResult.eventCount;
        console.log(`    Events: ${ev.mouse||0} mouse, ${ev.scroll||0} scroll, ${ev.clicks||0} clicks, ${ev.keys||0} keys${ev.input ? ', '+ev.input+' input' : ''}`);
      }
      console.log(`    ✓ saved → ${slug}.json`);
    } catch (err) {
      console.error(`  ✗ Error: ${err.message}`);
    }
  }

  if (!SKIP_SERVER) stopServer();

  console.log('\n═══════════════════════════════════════');
  console.log('  BASELINE SUMMARY');
  console.log('═══════════════════════════════════════');
  const files = readdirSync(OUT).filter(f => f.endsWith('.json'));
  for (const f of files) {
    try {
      const d = JSON.parse(readFileSync(join(OUT, f), 'utf-8'));
      const bot = d.botOrNot;
      if (bot && bot.botProbability !== undefined) {
        console.log(`  ${f.replace('.json', '').padEnd(40)} ${bot.botProbability}% (${bot.confidence})`);
      }
    } catch {}
  }
  console.log(`\n${files.length} results in expected-results/`);
}

main().catch(err => { console.error('Fatal:', err); stopServer(); process.exit(1); });
