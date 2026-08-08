'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { setTimeout: delay } = require('node:timers/promises');

const { startProgress } = require('../dist/progress.js');

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
  const stop = startProgress({
    sendNotification: async (n) => { sent.push(n); },
    progressToken: 7,
    totalSeconds: 1,
    label: 'Solving',
    intervalMs: 20,
  });

  await delay(120);
  stop();

  const values = sent.map((n) => n.params.progress);
  for (let i = 1; i < values.length; i += 1) {
    assert.ok(values[i] >= values[i - 1], `progress went backwards: ${values}`);
  }
  for (const value of values) {
    assert.ok(value <= 1, `progress ${value} exceeded total 1`);
  }
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
