'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { startHarness } = require('../test-helpers/harness.js');
const { CODE } = require('../test-helpers/mockServer.js');

test('solves reCAPTCHA v2 and names the response field', async () => {
  const { client, close } = await startHarness();
  try {
    const result = await client.callTool({
      name: 'capskip_solve_recaptcha',
      arguments: { sitekey: '6LtestKey', url: 'https://example.com/login' },
    });
    assert.notStrictEqual(result.isError, true, result.content?.[0]?.text);
    assert.strictEqual(result.structuredContent.code, CODE);
    assert.match(result.content[0].text, /g-recaptcha-response/);
  } finally {
    await close();
  }
});

test('solves reCAPTCHA v3 with an action', async () => {
  const { client, close } = await startHarness();
  try {
    const result = await client.callTool({
      name: 'capskip_solve_recaptcha',
      arguments: {
        sitekey: '6LtestKey', url: 'https://example.com/login',
        version: 'v3', action: 'submit',
      },
    });
    assert.notStrictEqual(result.isError, true, result.content?.[0]?.text);
    assert.strictEqual(result.structuredContent.code, CODE);
  } finally {
    await close();
  }
});

test('min_score is rejected as an unrecognized key', async () => {
  const { client, close } = await startHarness();
  try {
    const result = await client.callTool({
      name: 'capskip_solve_recaptcha',
      arguments: {
        sitekey: '6LtestKey', url: 'https://example.com', version: 'v3', min_score: 0.9,
      },
    });
    assert.strictEqual(result.isError, true);
    assert.match(result.content[0].text, /min_score/);
  } finally {
    await close();
  }
});

test('action on v2 is rejected with an explanation', async () => {
  const { client, close } = await startHarness();
  try {
    const result = await client.callTool({
      name: 'capskip_solve_recaptcha',
      arguments: { sitekey: '6LtestKey', url: 'https://example.com', action: 'submit' },
    });
    assert.strictEqual(result.isError, true);
    assert.match(result.content[0].text, /v3/);
  } finally {
    await close();
  }
});

test('invisible on v3 is rejected with an explanation', async () => {
  const { client, close } = await startHarness();
  try {
    const result = await client.callTool({
      name: 'capskip_solve_recaptcha',
      arguments: {
        sitekey: '6LtestKey', url: 'https://example.com', version: 'v3', invisible: true,
      },
    });
    assert.strictEqual(result.isError, true);
    assert.match(result.content[0].text, /v2/);
  } finally {
    await close();
  }
});

test('a bare url without a scheme is rejected', async () => {
  const { client, close } = await startHarness();
  try {
    const result = await client.callTool({
      name: 'capskip_solve_recaptcha',
      arguments: { sitekey: '6LtestKey', url: 'example.com' },
    });
    assert.strictEqual(result.isError, true);
    assert.match(result.content[0].text, /url/);
  } finally {
    await close();
  }
});

test('an unsupported proxy type is rejected', async () => {
  const { client, close } = await startHarness();
  try {
    const result = await client.callTool({
      name: 'capskip_solve_recaptcha',
      arguments: {
        sitekey: '6LtestKey', url: 'https://example.com',
        proxy: { type: 'SOCKS4', uri: '1.2.3.4:3128' },
      },
    });
    assert.strictEqual(result.isError, true);
  } finally {
    await close();
  }
});

test('a supported proxy is accepted', async () => {
  const { client, close } = await startHarness();
  try {
    const result = await client.callTool({
      name: 'capskip_solve_recaptcha',
      arguments: {
        sitekey: '6LtestKey', url: 'https://example.com',
        proxy: { type: 'SOCKS5', uri: 'user:pass@1.2.3.4:3128' },
      },
    });
    assert.notStrictEqual(result.isError, true, result.content?.[0]?.text);
  } finally {
    await close();
  }
});

test('enterprise and invisible flags are accepted on v2', async () => {
  const { client, close } = await startHarness();
  try {
    const result = await client.callTool({
      name: 'capskip_solve_recaptcha',
      arguments: {
        sitekey: '6LtestKey', url: 'https://example.com',
        enterprise: true, invisible: true,
      },
    });
    assert.notStrictEqual(result.isError, true, result.content?.[0]?.text);
  } finally {
    await close();
  }
});

test('a bad API key surfaces the key guidance', async () => {
  const { client, close } = await startHarness({ apiKey: 'badkey' });
  try {
    const result = await client.callTool({
      name: 'capskip_solve_recaptcha',
      arguments: { sitekey: '6LtestKey', url: 'https://example.com' },
    });
    assert.strictEqual(result.isError, true);
    assert.match(result.content[0].text, /CAPSKIP_API_KEY/);
  } finally {
    await close();
  }
});

test('a timed-out solve names the elapsed time and the captcha id', async () => {
  // The mock never returns a result for a pageurl containing "never", so a
  // 1-second timeout is guaranteed to elapse. This is the test that proves
  // runSolve's send-wrapping works: without it the id is lost, because the
  // SDK's TimeoutException does not carry one.
  const { client, close } = await startHarness();
  try {
    const result = await client.callTool({
      name: 'capskip_solve_recaptcha',
      arguments: { sitekey: '6LtestKey', url: 'https://never.example.com/login', timeout: 1 },
    });
    assert.strictEqual(result.isError, true);
    assert.match(result.content[0].text, /did not finish/i);
    assert.match(result.content[0].text, /captcha id \w+/i);
  } finally {
    await close();
  }
});
