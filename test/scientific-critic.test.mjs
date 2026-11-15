import test from 'node:test';
import assert from 'node:assert/strict';
import { critique } from '../automation/scientific-critic.mjs';

function report(overrides={}) {
  const observations = [];
  for (const engine of ['chromium','firefox','webkit'])
    for (const scenario of ['fingerprint-only','navigate-type-and-fingerprint'])
      observations.push({engine,scenario,outcome:'PASS',botScore:70,testsTotal:44,blockedWrites:0,blockedCrossOrigin:1});
  return {
    truthKind:'harness_attested_automation_only',humanGroundTruth:false,
    submissionToProduction:false, sourceCommit:'abc',deployedCommit:null,
    runId:'synthetic-fixture-1',observations,...overrides
  };
}
const options={expectedTestsTotal:44};
test('control matrix remains explicitly inconclusive for research accuracy and honeypot claims',()=>{
  const result=critique(report(),options);
  assert.equal(result.verdict,'INCONCLUSIVE');
  assert.equal(result.measurement.knownAutomationFlagged,6);
  assert.equal(result.researchQualified,false);
  assert.equal(result.releasePermitted,false);
  assert.ok(result.findings.some(f=>f.code==='HUMAN_CONTROLS_ABSENT'));
  assert.ok(result.findings.some(f=>f.code==='HONEYPOT_UNTESTED'));
  assert.ok(result.findings.some(f=>f.code==='DEPLOYED_REVISION_UNVERIFIED'));
});
test('the actual live-test count mismatch must be RED, not ignored',()=>{
  const input=report();
  input.observations.forEach(o=>o.testsTotal=49);
  const result=critique(input,options);
  assert.equal(result.verdict,'FAIL');
  assert.equal(result.findings.filter(f=>f.code==='DETECTOR_TEST_COUNT_MISMATCH').length,6);
});
test('known-bot misses flagged but never relabeled as humans',()=>{
  const input=report();
  input.observations[0].botScore=39;
  const result=critique(input,options);
  assert.equal(result.measurement.knownAutomationMissed,1);
  assert.equal(result.population,'harness_attested_automation_only');
  assert.ok(result.findings.some(f=>f.code==='KNOWN_AUTOMATION_MISSED'));
});
test('fail closed for write attempts, missing measurements and conflicting labels',()=>{
  const input=report({humanGroundTruth:true});
  input.observations[1].blockedWrites=1;
  input.observations[2].outcome='FAIL';
  input.observations.pop();
  const result=critique(input,options);
  assert.equal(result.verdict,'FAIL');
  for(const code of ['TRUTH_KIND_INVALID','PRODUCTION_WRITE_ATTEMPT','INCOMPLETE_OBSERVATION','MATRIX_CELL_MISSING'])
    assert.ok(result.findings.some(f=>f.code===code),code);
});
test('fresh honeypot regression prevents downstream qualification',()=>{
  const result=critique(report({deployedCommit:'verified-sha'}),{
    ...options,currentHoneypotReceipt:{passed:64,failed:24}
  });
  assert.equal(result.verdict,'FAIL');
  assert.ok(result.findings.some(f=>f.code==='HONEYPOT_REGRESSION'));
});
