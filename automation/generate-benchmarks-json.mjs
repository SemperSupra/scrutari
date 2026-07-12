#!/usr/bin/env node
/**
 * Generate benchmarks.json from the expected-results/ data.
 * This file is loaded by the SPA to display a benchmarks comparison table.
 *
 * Usage: node automation/generate-benchmarks-json.mjs
 */

import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'expected-results');
const BENCHMARKS_FILE = join(__dirname, '..', 'benchmarks.json');

// Manual entries for non-JS clients (can't be measured via Playwright)
const MANUAL_ENTRIES = [
  {
    name: 'curl (no JavaScript)',
    botScore: 100,
    confidence: 'High',
    reason: 'No JavaScript execution — bare HTTP client. No fingerprinting possible.',
    source: 'http-clients.sh',
  },
  {
    name: 'PowerShell Invoke-WebRequest',
    botScore: 100,
    confidence: 'High',
    reason: 'No JavaScript execution. Windows HTTP client.',
    source: 'http-clients.sh',
  },
  {
    name: 'Python requests / urllib',
    botScore: 100,
    confidence: 'High',
    reason: 'No JavaScript execution. Python HTTP client.',
    source: 'http-clients.sh',
  },
  {
    name: 'Lynx text browser',
    botScore: 100,
    confidence: 'High',
    reason: 'Text-mode browser with no JavaScript, canvas, WebGL, or CSS.',
    source: 'container-baselines.sh',
  },
  {
    name: 'ELinks text browser',
    botScore: 100,
    confidence: 'High',
    reason: 'Text-mode browser with minimal JavaScript support.',
    source: 'container-baselines.sh',
  },
];

function loadResults() {
  const files = readdirSync(OUT).filter(f => f.endsWith('.json') && !f.startsWith('curl_') && !f.startsWith('http_') && !f.startsWith('container_'));
  const entries = [];

  for (const f of files) {
    try {
      const d = JSON.parse(readFileSync(join(OUT, f), 'utf-8'));
      const bot = d.botOrNot;
      if (bot && bot.botProbability !== undefined) {
        // Pretty-print the name
        let name = d.test || f.replace('.json', '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        // Find top bot signals
        const topSignals = (bot.results || [])
          .filter(s => s.bot)
          .sort((a, b) => b.weight - a.weight)
          .slice(0, 3)
          .map(s => s.name);
        const topHumanSignals = (bot.results || [])
          .filter(s => !s.bot)
          .sort((a, b) => b.weight - a.weight)
          .slice(0, 3)
          .map(s => s.name);

        entries.push({
          name,
          botScore: bot.botProbability,
          confidence: bot.confidence,
          testsRun: bot.testsRun,
          userAgent: d.userAgent?.substring(0, 80) || 'unknown',
          topBotSignals: topSignals,
          topHumanSignals: topHumanSignals,
          source: 'Playwright baselines',
        });
      }
    } catch (e) {
      // skip malformed files
    }
  }

  return entries;
}

function main() {
  const measured = loadResults();
  const all = [...MANUAL_ENTRIES, ...measured];

  // Sort by botScore descending (most bot-like first)
  all.sort((a, b) => b.botScore - a.botScore);

  const benchmarks = {
    generated: new Date().toISOString(),
    totalConfigs: all.length,
    sources: ['http-clients.sh', 'container-baselines.sh', 'Playwright baselines (chromium, firefox, webkit)'],
    entries: all,
  };

  writeFileSync(BENCHMARKS_FILE, JSON.stringify(benchmarks, null, 2));
  console.log(`✓ Generated benchmarks.json with ${all.length} entries`);
  console.log('');
  console.log('Rankings (most bot-like → most human-like):');
  console.log('─'.repeat(60));
  for (const e of all) {
    const bar = '█'.repeat(Math.round(e.botScore / 5)) + '░'.repeat(20 - Math.round(e.botScore / 5));
    console.log(`  ${(e.botScore + '%').padStart(4)} ${bar} ${e.name.padEnd(35)} [${e.confidence}]`);
  }
}

main();
