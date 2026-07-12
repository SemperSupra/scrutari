#!/usr/bin/env node
/**
 * Scrutari Cross-Reference Comparison
 *
 * Visits multiple detection systems with the SAME browser session
 * and compares their results against Scrutari's Bot-or-Not score.
 *
 * Systems tested:
 *   1. Scrutari Bot-or-Not (ours)
 *   2. EFF Cover Your Tracks (Panopticlick)
 *   3. BrowserLeaks
 *
 * Usage: node automation/cross-reference.mjs
 */

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'expected-results');
mkdirSync(OUT, { recursive: true });

const BASE = 'https://scrutari-submit-1783887159.netlify.app';

async function run() {
  console.log('═══════════════════════════════════════════');
  console.log('  CROSS-REFERENCE COMPARISON');
  console.log('═══════════════════════════════════════════\n');

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const results = [];

  // ─── 1. Scrutari Bot-or-Not ───
  console.log('▶ 1. Scrutari Bot-or-Not');
  const page1 = await ctx.newPage();
  await page1.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page1.waitForTimeout(1000);
  await page1.evaluate(async () => { if (typeof captureFingerprint === 'function') await captureFingerprint(); });
  await page1.waitForTimeout(5000);

  const scrutari = await page1.evaluate(() => {
    const items = document.querySelectorAll('#fingerprint-grid .stat-box');
    const fp = {};
    items.forEach(el => {
      const label = el.querySelector('.stat-label')?.textContent;
      const value = el.querySelector('.stat-value')?.textContent;
      if (label) fp[label] = value;
    });
    return {
      botScore: document.querySelector('.gauge-subtitle')?.textContent || '',
      category: document.querySelector('.gauge-title')?.textContent || '',
      engine: fp['JS Engine'],
      automation: fp['Automation Frameworks'],
      fonts: fp['Fonts Detected'],
      webgl: fp['WebGL Renderer'],
      screen: fp['Screen Resolution'],
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      userAgent: navigator.userAgent,
    };
  });
  console.log(`  Bot-or-Not: ${scrutari.category} — ${scrutari.botScore}`);
  console.log(`  Engine: ${scrutari.engine}`);
  console.log(`  WebGL: ${(scrutari.webgl || '').substring(0, 40)}`);
  results.push({ system: 'Scrutari Bot-or-Not', ...scrutari });
  await page1.close();

  // ─── 2. EFF Cover Your Tracks ───
  console.log('\n▶ 2. EFF Cover Your Tracks (Panopticlick)');
  const page2 = await ctx.newPage();
  try {
    await page2.goto('https://coveryourtracks.eff.org/', { waitUntil: 'networkidle', timeout: 15000 });
    await page2.waitForTimeout(2000);

    // Click "Test Me" button
    try {
      await page2.click('button:has-text("Test Me")', { timeout: 5000 });
      await page2.waitForTimeout(10000);
    } catch {}

    const effResult = await page2.evaluate(() => {
      const text = document.body.innerText || '';
      return {
        fingerprint: (text.match(/fingerprint.*?unique/i)?.[0] || text.substring(0, 200)).substring(0, 100),
        bits: (text.match(/\d+\.\d+ bits/i)?.[0] || 'N/A'),
        pages: (text.match(/[\d,]+ (other )?pages/i)?.[0] || 'N/A'),
        title: document.title,
      };
    });
    console.log(`  Title: ${effResult.title}`);
    console.log(`  Bits: ${effResult.bits}`);
    console.log(`  Fingerprint: ${effResult.fingerprint}`);
    results.push({ system: 'EFF Cover Your Tracks', ...effResult });
  } catch (e) {
    console.log(`  Error: ${e.message}`);
    results.push({ system: 'EFF Cover Your Tracks', error: e.message });
  }
  await page2.close();

  // ─── 3. BrowserLeaks WebRTC ───
  console.log('\n▶ 3. BrowserLeaks WebRTC');
  const page3 = await ctx.newPage();
  try {
    await page3.goto('https://browserleaks.com/webrtc', { waitUntil: 'networkidle', timeout: 15000 });
    await page3.waitForTimeout(3000);

    const blResult = await page3.evaluate(() => {
      const cells = document.querySelectorAll('td');
      const ips = [];
      cells.forEach(c => {
        const text = c.textContent?.trim() || '';
        if (text.match(/^\d+\.\d+\.\d+\.\d+$/) || text.includes(':')) ips.push(text);
      });
      return { ips: ips.slice(0, 5), count: ips.length };
    });
    console.log(`  IPs detected: ${blResult.count}`);
    console.log(`  Sample: ${blResult.ips.slice(0, 3).join(', ')}`);
    results.push({ system: 'BrowserLeaks WebRTC', ips: blResult.ips, count: blResult.count });
  } catch (e) {
    console.log(`  Error: ${e.message}`);
    results.push({ system: 'BrowserLeaks WebRTC', error: e.message });
  }
  await page3.close();

  // ─── Summary ───
  console.log('\n═══════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════');
  console.log(`  Scrutari:          ${scrutari.category} — ${scrutari.botScore}`);
  console.log(`  Cover Your Tracks: ${results[1]?.bits || 'N/A'}`);
  console.log(`  BrowserLeaks:      ${results[2]?.count || 'N/A'} IPs detected`);
  console.log(`  User Agent:        ${(scrutari.userAgent || '').substring(0, 60)}...`);

  // Save
  const out = { timestamp: new Date().toISOString(), browser: 'Chromium headless', results };
  writeFileSync(join(OUT, 'cross-reference.json'), JSON.stringify(out, null, 2));
  console.log(`\nSaved to expected-results/cross-reference.json`);

  await browser.close();
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });
