import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

// Listen for console messages from the page
page.on('console', msg => console.log('PAGE:', msg.type(), msg.text()));
page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

await page.goto('http://127.0.0.1:8765', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

// Check what functions and globals exist
const checks = await page.evaluate(() => {
  return {
    typeofCaptureFingerprint: typeof captureFingerprint,
    typeofWindowCapture: typeof window.captureFingerprint,
    typeofComputeBotOrNot: typeof computeBotOrNot,
    windowKeys: Object.keys(window).filter(k => k.toLowerCase().includes('fingerprint') || k.toLowerCase().includes('capture') || k.toLowerCase().includes('bot') || k === 'captureFingerprint'),
    scriptCount: document.scripts.length,
    bodyText: document.body.textContent?.substring(0, 100),
  };
});

console.log('checks:', JSON.stringify(checks, null, 2));
await browser.close();
