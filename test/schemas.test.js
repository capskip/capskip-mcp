'use strict';

const test = require('node:test');
const assert = require('node:assert');

const {
  proxySchema, timeoutSchema, pageUrlSchema, baseSolveOutput, turnstileOutput, geetestOutput,
} = require('../dist/schemas.js');
const { createContext, createClient } = require('../dist/solver.js');

test('proxy accepts the four types CapSkip supports', () => {
  for (const type of ['HTTP', 'HTTPS', 'SOCKS5', 'SOCKS5H']) {
    assert.ok(proxySchema.safeParse({ type, uri: '1.2.3.4:3128' }).success, type);
  }
});

test('proxy rejects SOCKS4, which CapSkip does not map', () => {
  assert.strictEqual(proxySchema.safeParse({ type: 'SOCKS4', uri: '1.2.3.4:3128' }).success, false);
});

test('proxy requires a non-empty uri', () => {
  assert.strictEqual(proxySchema.safeParse({ type: 'HTTP', uri: '' }).success, false);
});

test('timeout accepts 1..600 and rejects beyond', () => {
  assert.ok(timeoutSchema.safeParse(1).success);
  assert.ok(timeoutSchema.safeParse(600).success);
  assert.ok(timeoutSchema.safeParse(undefined).success);
  assert.strictEqual(timeoutSchema.safeParse(601).success, false);
  assert.strictEqual(timeoutSchema.safeParse(0).success, false);
  assert.strictEqual(timeoutSchema.safeParse(12.5).success, false);
});

test('page url requires a scheme', () => {
  assert.ok(pageUrlSchema.safeParse('https://example.com/login').success);
  assert.strictEqual(pageUrlSchema.safeParse('example.com').success, false);
});

test('output schemas accept their documented shapes', () => {
  assert.ok(baseSolveOutput.safeParse({ captchaId: '1', code: 'X', solveSeconds: 1.2 }).success);
  assert.ok(turnstileOutput.safeParse({
    captchaId: '1', code: 'X', solveSeconds: 1.2, userAgent: 'UA/1.0',
  }).success);
  assert.ok(geetestOutput.safeParse({
    captchaId: '1', code: '{}', solveSeconds: 1.2, challenge: 'c', validate: 'v', seccode: 's',
  }).success);
});

const CONFIG = {
  apiKey: 'k', host: '10.0.0.1', port: 9999,
  defaultTimeout: 120, recaptchaTimeout: 300, pollingInterval: 5,
};

test('createContext carries the config', () => {
  assert.strictEqual(createContext(CONFIG).config.port, 9999);
});

test('createClient binds host, port, and key', () => {
  const client = createClient(CONFIG, 42);
  assert.strictEqual(client.apiKey, 'k');
  assert.strictEqual(client.apiClient.host, '10.0.0.1');
  assert.strictEqual(client.apiClient.port, 9999);
  assert.strictEqual(client.pollingInterval, 5);
});

test('createClient applies the per-call timeout to both timeout fields', () => {
  // normal() reads defaultTimeout; recaptcha/turnstile/geetest read
  // recaptchaTimeout. Setting both is how one `timeout` argument reaches
  // every captcha type without special-casing.
  const client = createClient(CONFIG, 42);
  assert.strictEqual(client.defaultTimeout, 42);
  assert.strictEqual(client.recaptchaTimeout, 42);
});
