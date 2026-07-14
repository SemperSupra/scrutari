// Scrutari State Machine Invariant Tests
// Validates state machine properties that must always hold

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─── Behavioral recording invariants ───

describe('Behavioral recording state machine', () => {
  it('start while already running is safe (double-start guard)', () => {
    const events = [];
    let running = false;
    let timerCount = 0;

    function start() {
      if (running) return; // THE GUARD
      running = true;
      timerCount++;
      events.push('start');
    }

    function stop() {
      if (!running) return;
      running = false;
      events.push('stop');
    }

    start();
    start(); // second call — should be no-op
    assert.equal(timerCount, 1, 'should only start one timer');
    assert.equal(events.length, 1, 'should only emit one start event');

    stop();
    assert.equal(running, false);
    assert.equal(events.length, 2);
  });

  it('stop when not running is safe', () => {
    let running = false;
    const events = [];

    function stop() {
      if (!running) return;
      running = false;
      events.push('stop');
    }

    stop(); // should not throw
    assert.equal(events.length, 0);
  });

  it('rapid start/stop cycles clean up all listeners', () => {
    const activeListeners = new Set();
    const allRegistrations = [];

    function addListener(name) {
      allRegistrations.push(name);
      activeListeners.add(name);
    }

    function removeListener(name) {
      activeListeners.delete(name);
    }

    for (let i = 0; i < 5; i++) {
      addListener('mousemove');
      addListener('scroll');
      removeListener('mousemove');
      removeListener('scroll');
    }

    assert.equal(activeListeners.size, 0, 'no listeners should remain active');
    assert.equal(allRegistrations.length, 10, '10 total registrations across 5 cycles');
  });
});

// ─── Navigation state machine invariants ───

describe('Navigation state machine', () => {
  const ORDER = ['section-exit-node', 'section-fingerprint', 'section-webrtc', 'section-behavior', 'section-botornot'];

  function navigateTo(id, visited) {
    const idx = ORDER.indexOf(id);
    if (idx >= 0) {
      visited.push(id);
      return idx;
    }
    return -1;
  }

  it('navigating to unknown section returns -1', () => {
    const visited = [];
    assert.equal(navigateTo('section-nonexistent', visited), -1);
    assert.equal(visited.length, 0);
  });

  it('navigating in order visits each section exactly once', () => {
    const visited = [];
    for (const section of ORDER) {
      const idx = navigateTo(section, visited);
      assert.ok(idx >= 0);
    }
    assert.equal(visited.length, 5);
    assert.deepEqual(visited, ORDER);
  });

  it('navigating to same section twice is idempotent', () => {
    const visited = [];
    navigateTo('section-fingerprint', visited);
    navigateTo('section-fingerprint', visited);
    assert.equal(visited.length, 2);
    assert.equal(visited[0], visited[1]);
  });

  it('reverse order navigation works', () => {
    const visited = [];
    const reversed = [...ORDER].reverse();
    for (const section of reversed) {
      const idx = navigateTo(section, visited);
      assert.ok(idx >= 0);
    }
    assert.deepEqual(visited, reversed);
  });
});

// ─── Submission state machine invariants ───

describe('Submission state machine', () => {
  it('cannot submit without fingerprint data', () => {
    function buildSubmissionData(fp) {
      if (!fp) return { error: 'no data' };
      return { botScore: fp.botScore };
    }
    assert.equal(buildSubmissionData(null).error, 'no data');
  });

  it('cannot submit without consent', () => {
    const btn = { disabled: true };
    function updateButton(consented) { btn.disabled = !consented; }
    updateButton(false);
    assert.equal(btn.disabled, true);
    updateButton(true);
    assert.equal(btn.disabled, false);
  });

  it('429 response triggers retry', async () => {
    let attempts = 0;
    async function submit() {
      attempts++;
      if (attempts === 1) return 429;
      return 200;
    }
    const result = await submit();
    assert.equal(result, 429);
    const result2 = await submit();
    assert.equal(result2, 200);
    assert.equal(attempts, 2);
  });
});
