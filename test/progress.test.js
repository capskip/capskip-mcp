'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { setTimeout: delay } = require('node:timers/promises');

const { startProgress } = require('../dist/progress.js');
const { startHarness } = require('../test-helpers/harness.js');

test('emits notifications while running', async () => {
  const sent = [];
  const stop = startProgress({
    sendNotification: async (n) => { sent.push(n); },
    progressToken: 'tok-1',
    totalSeconds: 10,
    label: 'Solving reCAPTCHA',
    intervalMs: 20,
  });

  await delay(90);
  stop();
  const countAtStop = sent.length;

  assert.ok(countAtStop >= 2, `expected at least 2 notifications, got ${countAtStop}`);
  assert.strictEqual(sent[0].method, 'notifications/progress');
  assert.strictEqual(sent[0].params.progressToken, 'tok-1');
  assert.strictEqual(sent[0].params.total, 10);
  assert.match(sent[0].params.message, /Solving reCAPTCHA/);

  await delay(60);
  assert.strictEqual(sent.length, countAtStop, 'no notifications after stop()');
});

test('progress increases monotonically and never exceeds total', async () => {
  const sent = [];
  // totalSeconds is deliberately shorter than the run: the ticker must reach
  // and stay at the ceiling. A longer total than the test's own duration would
  // never exercise the clamp, so removing Math.min would go undetected.
  const TOTAL = 0.05;
  const stop = startProgress({
    sendNotification: async (n) => { sent.push(n); },
    progressToken: 7,
    totalSeconds: TOTAL,
    label: 'Solving',
    intervalMs: 20,
  });

  await delay(150);
  stop();

  const values = sent.map((n) => n.params.progress);
  assert.ok(values.length >= 3, `expected several notifications, got ${values.length}`);

  for (let i = 1; i < values.length; i += 1) {
    assert.ok(values[i] >= values[i - 1], `progress went backwards: ${values}`);
  }
  for (const value of values) {
    assert.ok(value <= TOTAL, `progress ${value} exceeded total ${TOTAL}`);
  }
  assert.ok(
    values.some((value) => value === TOTAL),
    `the clamp never engaged — expected some value pinned at ${TOTAL}, got ${values}`,
  );
});

test('no token means no timer and no notifications', async () => {
  const sent = [];
  const stop = startProgress({
    sendNotification: async (n) => { sent.push(n); },
    progressToken: undefined,
    totalSeconds: 10,
    label: 'Solving',
    intervalMs: 10,
  });

  await delay(50);
  stop();
  assert.strictEqual(sent.length, 0);
});

test('a rejecting sendNotification does not stop the ticker or crash', async () => {
  let attempts = 0;
  const stop = startProgress({
    sendNotification: async () => { attempts += 1; throw new Error('transport closed'); },
    progressToken: 'tok-2',
    totalSeconds: 5,
    label: 'Solving',
    intervalMs: 10,
  });

  await delay(60);
  stop();

  // The ticker must survive a rejected send: a momentarily unwritable transport
  // must not silently end progress for a solve that is still running. Reaching
  // this line also proves the rejection was handled, since an unhandled
  // rejection aborts the test runner.
  assert.ok(attempts >= 2, `expected repeated attempts, got ${attempts}`);
});

test('a real tool call emits progress notifications to the client', async () => {
  // Everything above tests startProgress in isolation. Nothing tested the wiring
  // between it and a tool call — the progressToken is read from `extra._meta`,
  // which used to be reached through a double cast that disabled all checking.
  // If the SDK moved that field, or the tools stopped forwarding `extra`, the
  // unit tests above would still pass and the server would silently stop
  // reporting progress, tripping client timeouts on every long solve.
  //
  // The mock never resolves a "never" pageurl, so this solve runs to its
  // timeout. That is the point: assert on the notifications, not the result.
  const TIMEOUT_SECONDS = 6;
  const notifications = [];

  const { client, close } = await startHarness();
  try {
    const result = await client.callTool(
      {
        name: 'capskip_solve_recaptcha',
        arguments: {
          sitekey: '6LtestKey',
          url: 'https://never.example.com/login',
          timeout: TIMEOUT_SECONDS,
        },
      },
      undefined,
      { onprogress: (p) => { notifications.push(p); } },
    );

    // The solve is expected to time out; this only confirms it got that far.
    assert.strictEqual(result.isError, true);

    assert.ok(
      notifications.length >= 1,
      `expected at least one progress notification, got ${notifications.length}`,
    );
    for (const n of notifications) {
      assert.strictEqual(typeof n.progress, 'number', `progress was ${typeof n.progress}`);
      assert.strictEqual(n.total, TIMEOUT_SECONDS, 'total must be the timeout this call asked for');
      assert.match(n.message, /reCAPTCHA v2/);
    }
  } finally {
    await close();
  }
});

test('stop() is idempotent and silences the ticker', async () => {
  const sent = [];
  const stop = startProgress({
    sendNotification: async (n) => { sent.push(n); },
    progressToken: 'tok-3',
    totalSeconds: 5,
    label: 'Solving',
    intervalMs: 10,
  });

  assert.doesNotThrow(() => { stop(); stop(); });
  await delay(50);
  assert.strictEqual(sent.length, 0, 'no notifications after stop()');
});
