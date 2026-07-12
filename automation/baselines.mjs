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

      // Start behavioral recording
      await page.evaluate(() => { if (typeof toggleBehaviorRecording === 'function') toggleBehaviorRecording(); });
      await page.waitForTimeout(500);

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
        // 1. Mouse movement — move naturally between elements
        for (let step = 0; step < 5; step++) {
          const x = 200 + Math.floor(Math.random() * 400);
          const y = 200 + Math.floor(Math.random() * 400);
          await page.mouse.move(x, y, { steps: 8 });
          await page.waitForTimeout(100 + Math.floor(Math.random() * 200));
        }
        // 2. Scroll with pauses
        await page.evaluate(() => window.scrollBy({ top: 300, behavior: 'smooth' }));
        await page.waitForTimeout(800);
        await page.evaluate(() => window.scrollBy({ top: -100, behavior: 'smooth' }));
        await page.waitForTimeout(600);
        // 3. Click only the normal button
        await page.mouse.move(300, 350, { steps: 5 });
        await page.waitForTimeout(200);
        await page.click('#btn-primary', { timeout: 1000 }).catch(() => {});
        await page.waitForTimeout(300);
        // 4. Type in fields with delay (natural)
        await page.click('#input-main', { timeout: 1000 }).catch(() => {});
        await page.waitForTimeout(400);
        await page.type('#input-main', 'hello, this is a human typing', { delay: 80, timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(200);
        // 5. Do NOT touch honeypot or decoy buttons
      }

      // Stop recording — click the stop button
      await page.evaluate(() => { if (typeof toggleBehaviorRecording === 'function') toggleBehaviorRecording(); });
      await page.waitForTimeout(1000);

      // Extract behavioral results from DOM
      const behResult = await page.evaluate(() => {
        const inner = document.getElementById('behavior-results-inner');
        const title = inner?.querySelector('div:nth-child(2)')?.textContent || '';
        const subtitle = inner?.querySelector('div:nth-child(3)')?.textContent || '';
        const events = inner?.querySelector('div:nth-child(6)')?.textContent || '';
        // Try to get the behavioral analysis engine's last result
        let score = null;
        const match = subtitle.match(/(\d+)%/);
        if (match) score = parseInt(match[1]);
        return { title, subtitle, score, events };
      });

      // Also compute what the behavioral analysis returned
      const fullResult = await page.evaluate(() => {
        if (typeof __lastBehaviorResult !== 'undefined') return __lastBehaviorResult;
        // Try to read from the display
        const items = document.querySelectorAll('#beh-signals .beh-signal-item');
        const signals = [];
        items.forEach(el => {
          const spans = el.querySelectorAll('span');
          signals.push({
            name: spans[1]?.textContent || '',
            result: spans[2]?.textContent || '',
            weight: (spans[3]?.textContent || '').replace('w', ''),
          });
        });
        return { signals };
      });

      await browser.close();

      const saved = {
        test: bt.name,
        timestamp: new Date().toISOString(),
        behavioralScore: behResult.score,
        behavioralTitle: behResult.title,
        behavioralEvents: behResult.events,
        signals: fullResult?.signals || [],
      };
      const slug = bt.name.replace(/[^a-z0-9-]/gi, '_').toLowerCase();
      writeFileSync(join(OUT, `${slug}.json`), JSON.stringify(saved, null, 2));
      console.log(`    Behavioral score: ${behResult.score !== null ? behResult.score + '% bot' : 'N/A'}`);
      console.log(`    ${behResult.events}`);
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
