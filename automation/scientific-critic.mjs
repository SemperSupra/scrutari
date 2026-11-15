/**
 * Scrutari synthetic browser critic: deterministic first line of defense.
 *
 * No model access, network I/O or production mutation. Input is an already
 * sanitized, harness-attested observation report. Its outputs are evidence
 * verdicts and proposed next research questions, never deployment changes.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const ENGINES = ['chromium','firefox','webkit'];
const SCENARIOS = ['fingerprint-only','navigate-type-and-fingerprint'];

function finding(code, severity, detail) { return { code, severity, detail }; }
export function critique(report, opts = {}) {
  const findings = [];
  const observations = Array.isArray(report?.observations) ? report.observations : [];
  const threshold = Number.isFinite(opts.threshold) ? opts.threshold : 50;
  const expectedTestsTotal = Number.isInteger(opts.expectedTestsTotal) ? opts.expectedTestsTotal : null;
  const blockedWrites = observations.reduce((n, o) => n + (o?.blockedWrites || 0), 0);
  if (report?.truthKind !== 'harness_attested_automation_only' || report?.humanGroundTruth !== false) {
    findings.push(finding('TRUTH_KIND_INVALID','FAIL','Must be attested automated-browser controls, not verified humans.'));
  }
  if (report?.submissionToProduction !== false || blockedWrites > 0) {
    findings.push(finding('PRODUCTION_WRITE_ATTEMPT','FAIL','Production submission is forbidden in this lane.'));
  }
  const seen = new Set();
  for (const o of observations) {
    const key = String(o?.engine) + '/' + String(o?.scenario);
    if (seen.has(key)) findings.push(finding('DUPLICATE_MATRIX_CELL','FAIL','Duplicate engine/scenario cell: '+key));
    seen.add(key);
    if (o?.outcome !== 'PASS' || !Number.isInteger(o.botScore) || o.botScore < 0 || o.botScore > 100) {
      findings.push(finding('INCOMPLETE_OBSERVATION','FAIL','Unqualified browser observation: '+key));
    }
    if (expectedTestsTotal !== null && o?.testsTotal !== expectedTestsTotal) {
      findings.push(finding('DETECTOR_TEST_COUNT_MISMATCH','FAIL','Live testsTotal differs from source at '+key));
    }
    if (o?.blockedCrossOrigin > 0) {
      // It is safe to block traffic; it can also change the fingerprint result.
      // Flag the potential confounder rather than failing safety.
      if (!findings.some(f => f.code === 'NETWORK_POLICY_CONFOUNDER')) {
        findings.push(finding('NETWORK_POLICY_CONFOUNDER','WARN','Cross-origin requests were blocked; avoid generalizing to normal browsing.'));
      }
    }
  }
  for (const engine of ENGINES) for (const scenario of SCENARIOS) {
    if (!seen.has(engine+'/'+scenario)) {
      findings.push(finding('MATRIX_CELL_MISSING','FAIL','Missing '+engine+'/'+scenario));
    }
  }
  if (observations.length !== 6) findings.push(finding('WRONG_MATRIX_SIZE','FAIL','Expected exactly six observations.'));
  const successful = observations.filter(o => o?.outcome === 'PASS' && Number.isInteger(o.botScore));
  const positive = successful.filter(o => o.botScore > threshold);
  if (successful.length && positive.length < successful.length) {
    findings.push(finding('KNOWN_AUTOMATION_MISSED','WARN',String(successful.length-positive.length)+'/'+successful.length+' known automation sessions scored at or below the fixed decision threshold.'));
  }
  if (!report?.deployedCommit) {
    findings.push(finding('DEPLOYED_REVISION_UNVERIFIED','INCONCLUSIVE','Exact Netlify deployed commit is unknown; score drift cannot be attributed.'));
  }
  if (!opts.currentHoneypotReceipt) {
    findings.push(finding('HONEYPOT_UNTESTED','INCONCLUSIVE','Read-only observer does not exercise all honeypots; separate isolated honeypot regression is required.'));
  } else if (!(opts.currentHoneypotReceipt.passed >= 88 && opts.currentHoneypotReceipt.failed === 0)) {
    findings.push(finding('HONEYPOT_REGRESSION','FAIL','The supplied fresh honeypot test receipt is not a full pass.'));
  }
  findings.push(finding('HUMAN_CONTROLS_ABSENT','INCONCLUSIVE','Known automation only: cannot estimate human false-positive rate or population accuracy.'));
  return {
    schemaVersion: 1,
    provenance: {
      observerRunId: report?.runId || null,
      sourceCommit: report?.sourceCommit || null,
      deployedCommit: report?.deployedCommit || null,
    },
    population: 'harness_attested_automation_only',
    measurement: {
      attempted: observations.length,
      valid: successful.length,
      threshold,
      knownAutomationFlagged: positive.length,
      knownAutomationMissed: successful.length-positive.length,
      interpretation: 'Descriptive sample of repeated cloud automation observations, not independent trials or detector recall.',
    },
    findings,
    verdict: findings.some(f => f.severity === 'FAIL') ? 'FAIL' : 'INCONCLUSIVE',
    researchQualified: false,
    releasePermitted: false,
  };
}

async function main() {
  const [source, target] = process.argv.slice(2);
  if (!source || !target) throw new Error('Usage: node scientific-critic.mjs report.json output.json');
  const report = JSON.parse(await readFile(source,'utf8'));
  const original = await readFile('js/scrutari.js','utf8');
  const m = original.match(/testsTotal:\s*(\d+)/);
  if (!m) throw new Error('Detector source test-count declaration not found');
  const result = critique(report,{expectedTestsTotal:Number(m[1])});
  await writeFile(target, JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({verdict:result.verdict,findings:result.findings.map(f=>f.code),researchQualified:false}));
  if (result.verdict === 'FAIL') process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(e => { console.error('CRITIC_RUNTIME_ERROR:',e.message);process.exitCode=1; });
}
