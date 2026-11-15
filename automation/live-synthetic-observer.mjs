#!/usr/bin/env node
/**
 * Production SYNTHETIC browser observer. No storage writes.
 *
 * Runs a small, harness-attested automation matrix against our live public site.
 * All browser network traffic is limited to same-origin GET/HEAD. In particular,
 * POST/PUT/PATCH/DELETE, sendBeacon and external third-party requests are blocked.
 * Only aggregate scores and a synthetic environment receipt leave the worker.
 *
 * This does NOT provide human ground truth or qualify ML classifier accuracy.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { platform, release, arch } from 'node:os';
import { ALLOWED_ORIGINS, validateTarget, requestDecision, verifiedScore } from './observer-policy.mjs';

const OUTPUT = 'automation/observations/live-synthetic-report.json';
const target = validateTarget(process.env.SCRUTARI_OBSERVER_TARGET ||
  'https://scrutari-submit-1783887159.netlify.app/');
const requestedEngines = (process.env.SCRUTARI_OBSERVER_ENGINES || 'chromium,firefox,webkit')
  .split(',').map(v => v.trim());
const supported = ['chromium', 'firefox', 'webkit'];
if (!requestedEngines.length || requestedEngines.length > 3 ||
    new Set(requestedEngines).size !== requestedEngines.length ||
    requestedEngines.some(v => !supported.includes(v))) {
  throw new Error('Invalid browser list (select distinct chromium,firefox,webkit)');
}
const scenarios = ['fingerprint-only', 'navigate-type-and-fingerprint'];
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  runId: process.env.GITHUB_RUN_ID || 'local-ephemeral',
  sourceCommit: process.env.SCRUTARI_SOURCE_COMMIT || null,
  workflowCheckoutSha: process.env.GITHUB_SHA || null,
  deployedCommit: null, // Must be verified independently via Netlify deployment metadata.
  targetOrigin: target.origin,
  targetPath: target.pathname,
  truthKind: 'harness_attested_automation_only',
  humanGroundTruth: false,
  dataPartition: 'synthetic_browser_observation',
  submissionToProduction: false,
  browserNetworkPolicy: 'same_origin_get_head_only',
  environment: {
    runtime: process.version,
    os: platform(),
    osRelease: release(),
    arch: arch(),
    ci: process.env.CI === 'true',
  },
  observations: [],
  summary: {},
};

function errorKind(e) {
  const msg = String(e && (e.message || e));
  if (/timeout|timed out/i.test(msg)) return 'timeout';
  if (/browser.*closed|target.*closed/i.test(msg)) return 'browser_closed';
  return 'browser_or_script_error';
}
async function writeReport() {
  report.summary = {
    attempted: report.observations.length,
    passed: report.observations.filter(o => o.outcome === 'PASS').length,
    failed: report.observations.filter(o => o.outcome === 'FAIL').length,
    recordedScores: report.observations.filter(o => Number.isInteger(o.botScore)).length,
    harnessKnownAutomationFlaggedAt50: report.observations.filter(o => o.outcome === 'PASS' && o.flaggedAtAnalysisThreshold === true).length,
    interpretation: 'Descriptive automation controls from one runner; not independent class-accuracy data',
  };
  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  process.stdout.write(JSON.stringify({
    report: OUTPUT,
    ...report.summary,
    warning: 'Synthetic automation observations only; no production submissions; no human labels',
  }) + '\n');
}
async function observe(playwright, engineName, scenario) {
  const observation = {
    engine: engineName,
    scenario,
    label: 'known_automated_browser',
    labelAuthority: 'GitHub_Actions_browser_harness',
    outcome: 'FAIL',
    blockedWrites: 0,
    blockedCrossOrigin: 0,
    firstPartyGetRequests: 0,
    httpStatus: null,
    botScore: null,
    signalCount: 0,
    recordedAt: new Date().toISOString(),
  };
  let browser;
  let context;
  try {
    browser = await playwright[engineName].launch({ headless: true });
    observation.browserVersion = browser.version();
    context = await browser.newContext({
      acceptDownloads: false,
      serviceWorkers: 'block',
      locale: 'en-US',
      viewport: { width: 1280, height: 800 },
    });
    await context.route('**/*', async route => {
      const req = route.request();
      const decision = requestDecision(req.method(), req.url(), target.origin);
      if (decision === 'block-write') {
        observation.blockedWrites++;
        await route.abort();
      } else if (decision.startsWith('block-')) {
        observation.blockedCrossOrigin++;
        await route.abort();
      } else {
        if (decision === 'allow') observation.firstPartyGetRequests++;
        await route.continue();
      }
    });
    const page = await context.newPage();
    page.setDefaultTimeout(9000);
    const response = await page.goto(target.href, { waitUntil: 'domcontentloaded', timeout: 18000 });
    observation.httpStatus = response?.status() ?? null;
    if (observation.httpStatus !== 200) throw new Error('Unexpected response status');
    await page.locator('h1').waitFor({ state: 'visible', timeout: 9000 });
    observation.titlePresent = (await page.title()).includes('Scrutari');
    if (!observation.titlePresent) throw new Error('Unexpected page title');
    // Safely exercise actual site controls. Never click traps or submit buttons.
    if (scenario === 'navigate-type-and-fingerprint') {
      await page.getByRole('button', { name: '2. Fingerprint', exact: true }).click();
      await page.getByRole('button', { name: '4. Behavior', exact: true }).click();
      await page.locator('#input-main').fill('synthetic-browser-qualification', { timeout: 8000 });
      await page.mouse.move(180, 160, { steps: 8 });
      await page.mouse.wheel(0, 240);
    }
    await page.waitForFunction(() => typeof window.captureFingerprint === 'function', null, { timeout: 10000 });
    // The app-side function can run a bounded PoW benchmark and may be slow.
    // Do not invoke submitResults, no manual-source spoofs, no trust bypass.
    const score = await page.evaluate(async () => {
      await Promise.race([
        window.captureFingerprint(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('measurement timeout')), 35000)),
      ]);
      const result = window.__lastBotOrNotData;
      if (!result) return null;
      return {
        botProbability: result.botProbability,
        testsRun: result.testsRun,
        testsTotal: result.testsTotal,
        confidenceLabel: result.confidence,
        signals: Array.isArray(result.results) ? result.results.map(s => ({
          name: String(s.name).slice(0, 80),
          fired: !!s.bot,
          weight: s.weight,
        })) : [],
      };
    });
    if (!verifiedScore(score)) throw new Error('Missing/inconsistent detector score');
    observation.botScore = score.botProbability;
    observation.testsTotal = score.testsTotal;
    observation.flaggedAtAnalysisThreshold = score.botProbability > 50; // Existing analysis cutoff; fixed for this experiment.
    observation.signalCount = score.testsRun;
    observation.signalOutcomes = score.signals;
    observation.confidenceLabel = score.confidenceLabel; // Heuristic coverage, not calibrated statistical confidence.
    if (observation.blockedWrites > 0) throw new Error('Live site attempted a write; safely blocked by harness');
    observation.outcome = 'PASS';
  } catch (e) {
    observation.failureCategory = errorKind(e); // No raw URLs, PII, stack traces or secrets.
  } finally {
    try { await context?.close(); } catch {}
    try { await browser?.close(); } catch {}
  }
  return observation;
}

try {
  const playwright = await import('playwright');
  for (const engine of requestedEngines) {
    for (const scenario of scenarios) {
      report.observations.push(await observe(playwright, engine, scenario));
    }
  }
  await writeReport();
  if (report.summary.failed !== 0 || report.summary.attempted !== requestedEngines.length * scenarios.length) {
    process.exitCode = 1;
  }
} catch (e) {
  report.fatalFailureCategory = errorKind(e);
  await writeReport();
  process.exitCode = 1;
}
