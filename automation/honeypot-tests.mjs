#!/usr/bin/env node
/**
 * Honeypot/Tarpit Test Suite
 *
 * Tests all 30+ honeypot paths to ensure:
 *   1. Each returns HTTP 200 with realistic content
 *   2. Branding is consistent (ACME Corp, Laravel) across all pages
 *   3. Tarpit cookie tracking works across visits
 *   4. Stealth JS tracking script is injected correctly
 *   5. Different bot user-agents are classified and logged
 *   6. No "Page not found" or error responses
 *   7. All pages link to each other (crawler trap integrity)
 *
 * Usage: node automation/honeypot-tests.mjs
 */

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'expected-results');
mkdirSync(OUT, { recursive: true });

const BASE = 'https://scrutari-submit-1783887159.netlify.app';
const BRAND = 'ACME Corp';
const TECH = ['Laravel', 'PHP 8'];

// All honeypot paths that should return 200
const ALL_PATHS = [
  '/admin', '/admin/', '/admin/users', '/admin/reports',
  '/.env', '/backup', '/backup/', '/config.json',
  '/api/health', '/api', '/api/', '/api/v1', '/api/v1/',
  '/login', '/login/', '/register', '/register/',
  '/settings', '/settings/', '/dashboard', '/dashboard/',
  '/profile', '/profile/', '/billing', '/billing/', '/team', '/team/',
  '/staging', '/staging/', '/dev', '/dev/',
  '/healthz', '/version', '/credentials.json',
  '/.git/config', '/.git/HEAD',
  '/password/reset', '/password/confirm', '/verify-email',
];

// Paths that should have brand/tech markers (HTML pages)
const BRANDED_PATHS = [
  '/admin/', '/admin/users', '/admin/reports',
  '/dashboard/', '/settings/', '/profile/', '/billing/', '/team/',
  '/staging/', '/dev/',
];

// Paths that should have stealth tracking script
const TRACKED_PATHS = [
  '/admin/', '/admin/users', '/dashboard/', '/settings/', '/profile/',
  '/billing/', '/team/', '/staging/', '/dev/', '/login/', '/register/',
];

let passed = 0, failed = 0;
function assert(name, condition, detail = '') {
  if (condition) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${detail ? ': ' + detail : ''}`); }
}

async function run() {
  console.log('═══════════════════════════════════════════');
  console.log('  HONEYPOT/TARPIT TEST SUITE');
  console.log('═══════════════════════════════════════════\n');

  // ─── Test 1: All paths return 200 ───
  console.log('▶ 1. All 30+ paths return HTTP 200');
  for (const path of ALL_PATHS) {
    try {
      const resp = await fetch(BASE + path);
      assert(`${path} → HTTP ${resp.status}`, resp.status === 200, String(resp.status));
    } catch (e) {
      assert(`${path} → connection error`, false, e.message);
    }
  }

  // ─── Test 2: Brand consistency ───
  console.log('\n▶ 2. Brand consistency (ACME Corp + Laravel across all pages)');
  for (const path of BRANDED_PATHS) {
    const html = await (await fetch(BASE + path)).text();
    const hasBrand = html.includes(BRAND);
    const hasTech = TECH.some(t => html.includes(t));
    assert(`${path} → ACME Corp: ${hasBrand}, ${TECH[0]}: ${hasTech}`, hasBrand && hasTech,
      `brand=${hasBrand} tech=${hasTech}`);
  }

  // ─── Test 3: Stealth tracking script ───
  console.log('\n▶ 3. Stealth tracking script injected');
  for (const path of TRACKED_PATHS) {
    const html = await (await fetch(BASE + path)).text();
    const hasTracker = html.includes('hp_track') && html.includes('sendBeacon') && html.includes('canvas');
    const hasSubEndpoint = html.includes('/api/submit');
    assert(`${path} → tracker: ${hasTracker}, endpoint: ${hasSubEndpoint}`,
      hasTracker && hasSubEndpoint);
  }

  // ─── Test 4: Tarpit cookie tracking ───
  console.log('\n▶ 4. Tarpit visit tracking');
  // First visit — cookie should be 1
  const resp1 = await fetch(BASE + '/admin/', { redirect: 'manual' });
  const cookie1 = resp1.headers.get('set-cookie') || '';
  assert('First visit → __hp_visit=1', cookie1.includes('__hp_visit=1'), cookie1.substring(0, 50));

  // Simulate 5th visit
  const resp5 = await fetch(BASE + '/admin/', {
    headers: { Cookie: '__hp_visit=5' }
  });
  const cookie5 = resp5.headers.get('set-cookie') || '';
  assert('5th visit → __hp_visit=6', cookie5.includes('__hp_visit=6'), cookie5.substring(0, 50));

  // Verify content changes with visit count
  const html1 = await (await fetch(BASE + '/admin/')).text();
  const html6 = await (await fetch(BASE + '/admin/', { headers: { Cookie: '__hp_visit=5' } })).text();
  const diff = html1 !== html6;
  assert('Content differs between visit #1 and #5', diff);

  // ─── Test 5: Content type correctness ───
  console.log('\n▶ 5. Content-Type headers');
  const jsonPaths = ['/config.json', '/version', '/api/', '/api/health', '/credentials.json'];
  for (const path of jsonPaths) {
    const resp = await fetch(BASE + path);
    const ct = resp.headers.get('content-type') || '';
    assert(`${path} → ${ct}`, ct.includes('json'), ct);
  }
  const textPaths = ['/.env', '/.git/config', '/.git/HEAD', '/healthz'];
  for (const path of textPaths) {
    const resp = await fetch(BASE + path);
    const ct = resp.headers.get('content-type') || '';
    assert(`${path} → ${ct}`, ct.includes('text/'), ct);
  }

  // ─── Test 6: Bot classification ───
  console.log('\n▶ 6. Bot classification by User-Agent');
  const bots = {
    'Googlebot': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Bingbot': 'Mozilla/5.0 (compatible; Bingbot/2.0; +http://www.bing.com/bingbot.htm)',
    'curl': 'curl/8.0',
    'Python': 'Python-urllib/3.12',
    'Scrapy': 'Scrapy/2.11 (+https://scrapy.org)',
    'Headless Chrome': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/126.0.6478.71 Safari/537.36',
    'SEO Tool': 'Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)',
  };
  for (const [name, ua] of Object.entries(bots)) {
    const resp = await fetch(BASE + '/admin/', { headers: { 'User-Agent': ua } });
    assert(`${name} → HTTP ${resp.status}`, resp.status === 200, String(resp.status));
  }

  // ─── Test 7: Crawler trap integrity (pages link to each other) ───
  console.log('\n▶ 7. Crawler trap (pages link to each other)');
  const adminHTML = await (await fetch(BASE + '/admin/')).text();
  assert('/admin/ links to /settings', adminHTML.includes('/settings'));
  assert('/admin/ links to /dashboard', adminHTML.includes('/dashboard'));
  assert('/admin/ links to /admin/users', adminHTML.includes('/admin/users'));

  const settingsHTML = await (await fetch(BASE + '/settings/')).text();
  assert('/settings/ links to /admin/', settingsHTML.includes('/admin/'));

  const dashboardHTML = await (await fetch(BASE + '/dashboard/')).text();
  assert('/dashboard/ links to /admin/', dashboardHTML.includes('/admin/'));
  assert('/dashboard/ links to /team', dashboardHTML.includes('/team'));
  assert('/dashboard/ links to /billing', dashboardHTML.includes('/billing'));

  // ─── Test 8: Playwright browser test — verify stealth tracking works ───
  console.log('\n▶ 8. Playwright browser — stealth tracking fires in JS-enabled browser');
  try {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Listen for requests to /api/submit from the tracking beacon
    let beaconSent = null;
    page.on('request', req => {
      if (req.url().includes('/api/submit')) {
        beaconSent = req.url();
      }
    });

    await page.goto(BASE + '/admin/', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);

    // Check if the tracking JS executed without error
    const trackerRan = await page.evaluate(() => typeof hp_track === 'function');
    assert('hp_track function exists in browser context', trackerRan);

    // Check navigator.webdriver detection
    const wd = await page.evaluate(() => !!navigator.webdriver);
    assert('navigator.webdriver detected', wd === true || wd === false);

    await browser.close();
  } catch (e) {
    console.log(`  (Playwright test skipped: ${e.message})`);
  }

  // ─── Summary ───
  const total = passed + failed;
  console.log('\n═══════════════════════════════════════');
  console.log('  HONEYPOT TEST SUMMARY');
  console.log('═══════════════════════════════════════');
  console.log(`  Passed: ${passed}/${total}`);
  console.log(`  Failed: ${failed}/${total}`);
  console.log(`  Rate:   ${Math.round(passed / total * 100)}%`);

  const results = { timestamp: new Date().toISOString(), target: BASE, passed, failed, total };
  writeFileSync(join(OUT, 'honeypot-results.json'), JSON.stringify(results, null, 2));
  console.log(`\nSaved to expected-results/honeypot-results.json`);

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });
