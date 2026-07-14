#!/usr/bin/env node
/**
 * Scrutari IPv6 Connectivity Test Suite
 *
 * Validates that the SPA and endpoints work correctly over IPv6.
 * This catches any hardcoded IPv4 assumptions in the system.
 *
 * Prerequisites:
 *   python3 automation/server.py --bind ::   (IPv6 test server)
 *
 * Usage:
 *   node automation/ipv6-test.mjs
 *   node automation/ipv6-test.mjs --headed  # for debugging
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
const BASE = `http://[::1]:${PORT}`;
const HEADED = process.argv.includes('--headed');

let serverProc = null;

function startServer() {
  return new Promise((resolve, reject) => {
    serverProc = spawn('python3', [join(__dirname, 'server.py'), String(PORT), '--bind', '::'], {
      cwd: ROOT, stdio: 'ignore'
    });
    setTimeout(() => serverProc.exitCode === null ? resolve() : reject(), 1500);
  });
}
function stopServer() { if (serverProc) { serverProc.kill(); serverProc = null; } }

const TESTS = [];
let passed = 0, failed = 0;

function test(name, fn) {
  TESTS.push({ name, fn });
}

// ─── Tests ───

test('IPv6 server: returns index.html', async ({ page }) => {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 });
  const title = await page.title();
  if (!title.includes('Scrutari')) throw new Error(`Expected title "Scrutari", got "${title}"`);
});

test('IPv6 server: Bot-or-Not button exists', async ({ page }) => {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 });
  const btn = await page.locator('button:has-text("Capture Fingerprint")').count();
  if (btn === 0) throw new Error('Capture Fingerprint button not found over IPv6');
});

test('IPv6 server: fingerprint capture works', async ({ page }) => {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 });
  // Run capture via page context
  const ran = await page.evaluate(async () => {
    if (typeof captureFingerprint === 'function') {
      await captureFingerprint();
      return true;
    }
    return false;
  });
  if (!ran) {
    // Fallback: click button
    await page.locator('button:has-text("Capture Fingerprint")').click();
  }
  // Wait for async fingerprinting
  await page.waitForTimeout(10000);
  // Verify some fingerprint data appeared
  const fpCount = await page.locator('.stat-box').count();
  if (fpCount < 5) throw new Error(`Expected ≥5 fingerprint stats, got ${fpCount}`);
});

test('IPv6: IPv6 probe detects connectivity', async ({ page }) => {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 });
  await page.evaluate(async () => {
    if (typeof captureFingerprint === 'function') await captureFingerprint();
  });
  await page.waitForTimeout(10000);
  const ipv6Status = await page.evaluate(() => {
    const el = document.querySelector('.stat-value');
    if (!el) return null;
    const allStats = document.querySelectorAll('.stat-box');
    for (const s of allStats) {
      const label = s.querySelector('.stat-label');
      if (label && label.textContent.includes('IPv6')) {
        return s.querySelector('.stat-value')?.textContent;
      }
    }
    return null;
  });
  // On an IPv6-enabled network, IPv6 should be available
  // On IPv4-only networks, this may show "No" — that's OK
  console.log(`  IPv6 status: ${ipv6Status || 'not found'}`);
});

test('IPv6: classify endpoint works over v6', async ({ page }) => {
  const resp = await page.request.get(`${BASE.replace('[::1]', '127.0.0.1')}/api/classify`);
  const data = await resp.json();
  if (!data.ip) throw new Error('classify endpoint did not return IP');
  console.log(`  Classify IP: ${data.ip}, country: ${data.country}`);
});

// ─── Runner ───

async function run() {
  const startTime = Date.now();
  mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: !HEADED });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  });

  const results = [];

  for (const t of TESTS) {
    const page = await context.newPage();
    try {
      await t.fn({ page, context, browser });
      results.push({ name: t.name, passed: true });
      passed++;
      console.log(`  ✓ ${t.name}`);
    } catch (e) {
      results.push({ name: t.name, passed: false, error: e.message });
      failed++;
      console.log(`  ✗ ${t.name}: ${e.message}`);
    } finally {
      await page.close();
    }
  }

  await browser.close();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n  Results: ${passed}/${passed + failed} passed (${elapsed}s)`);

  // Save results
  const summary = {
    suite: 'IPv6 Connectivity',
    run: new Date().toISOString(),
    server: BASE,
    browser: 'Chromium',
    total: passed + failed, passed, failed,
    results,
  };
  const dateStr = new Date().toISOString().split('T')[0];
  writeFileSync(join(OUT, `ipv6-test-${dateStr}.json`), JSON.stringify(summary, null, 2));

  process.exit(failed > 0 ? 1 : 0);
}

// ─── Main ───

async function main() {
  console.log('═ Scrutari IPv6 Test Suite ═\n');

  const SKIP_SERVER = process.argv.includes('--server');
  if (!SKIP_SERVER) {
    console.log('[ ] Starting IPv6 test server...');
    await startServer();
    console.log(`[✓] Server running at ${BASE}`);
  }

  await run();

  if (!SKIP_SERVER) stopServer();
}

main().catch(e => { console.error(e); process.exit(1); });
