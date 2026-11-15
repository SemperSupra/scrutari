import test from 'node:test';
import assert from 'node:assert/strict';
import {validateTarget, requestDecision, verifiedScore} from '../automation/observer-policy.mjs';

const origin = 'https://scrutari-submit-1783887159.netlify.app';
test('only approved HTTPS Scrutari endpoints can be observed', () => {
  assert.equal(validateTarget(origin + '/').origin, origin);
  assert.equal(validateTarget('https://leak-detector.scrutari.cloud-ip.cc/').protocol, 'https:');
  assert.equal(validateTarget('https://sempersupra.github.io/scrutari/').pathname, '/scrutari/');
  for (const invalid of [
    'http://scrutari-submit-1783887159.netlify.app/',
    'https://other.netlify.app/', origin + '/api/export',
    origin + '/?token=secret', 'https://sempersupra.github.io/other/',
    'https://user:password@scrutari-submit-1783887159.netlify.app/',
  ]) assert.throws(() => validateTarget(invalid));
});

test('observer prevents production mutations and unapproved outbound requests', () => {
  for (const method of ['POST','PUT','PATCH','DELETE','OPTIONS']) {
    assert.equal(requestDecision(method, origin + '/api/submit', origin), 'block-write');
  }
  assert.equal(requestDecision('GET', origin + '/api/challenge', origin), 'allow');
  assert.equal(requestDecision('HEAD', origin + '/', origin), 'allow');
  assert.equal(requestDecision('GET', 'https://ipinfo.io/json', origin), 'block-cross-origin');
  assert.equal(requestDecision('POST', 'https://ipinfo.io/json', origin), 'block-write');
  assert.equal(requestDecision('GET', 'data:text/plain,hello', origin), 'allow-local');
});

test('only populated, bounded detector scores qualify as observations', () => {
  assert.equal(verifiedScore({botProbability:46,testsRun:41,testsTotal:44}), true);
  for (const item of [
    null, {botProbability:null,testsRun:42,testsTotal:44},
    {botProbability:101,testsRun:42,testsTotal:44},
    {botProbability:-1,testsRun:42,testsTotal:44},
    {botProbability:40,testsRun:0,testsTotal:44},
    {botProbability:40,testsRun:50,testsTotal:44},
  ]) assert.equal(verifiedScore(item), false);
});
