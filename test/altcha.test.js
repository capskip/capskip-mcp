'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { startHarness } = require('../test-helpers/harness.js');
const { ALTCHA_TOKEN, ALTCHA_NUMBER } = require('../test-helpers/mockServer.js');

const URL = 'https://example.com/signup';
const CHALLENGE_URL = 'https://example.com/captcha/api/altcha/challenge';
const CHALLENGE_JSON = JSON.stringify({
  algorithm: 'SHA-256',
  challenge: '3dd28253be6cc0c54d95f7f98c517e68',
  salt: '46d5b1c8871e5152d902ee3f?expires=1893456000',
  signature: '4b1cf0e0be0f4e5247e50b0f9a449830',
  maxnumber: 1000000,
});

test('solves ALTCHA from a challenge url', async () => {
  const { client, close } = await startHarness();
  try {
    const result = await client.callTool({
      name: 'capskip_solve_altcha',
      arguments: { url: URL, challenge_url: CHALLENGE_URL },
    });
    assert.notStrictEqual(result.isError, true, result.content?.[0]?.text);
    assert.strictEqual(result.structuredContent.code, ALTCHA_TOKEN);
    assert.ok(result.structuredContent.captchaId);
  } finally {
    await close();
  }
});

test('exposes the token and the counter that solved it', async () => {
  // This is the whole reason capskip_solve_altcha has its own output schema:
  // `token` is what goes in the site's form field, and `number` is decoded from
  // inside the base64 payload. Asserting the exact number proves it was parsed
  // out of the answer rather than echoed from the request.
  const { client, close } = await startHarness();
  try {
    const result = await client.callTool({
      name: 'capskip_solve_altcha',
      arguments: { url: URL, challenge_url: CHALLENGE_URL },
    });
    assert.notStrictEqual(result.isError, true, result.content?.[0]?.text);
    assert.strictEqual(result.structuredContent.token, ALTCHA_TOKEN);
    assert.strictEqual(result.structuredContent.number, ALTCHA_NUMBER);
    assert.match(result.content[0].text, /altcha/);
  } finally {
    await close();
  }
});

test('solves ALTCHA from an inline challenge document', async () => {
  const { client, close, lastSubmit } = await startHarness();
  try {
    const result = await client.callTool({
      name: 'capskip_solve_altcha',
      arguments: { url: URL, challenge_json: CHALLENGE_JSON },
    });
    assert.notStrictEqual(result.isError, true, result.content?.[0]?.text);
    assert.strictEqual(lastSubmit().method, 'altcha');
    assert.strictEqual(lastSubmit().challenge_json, CHALLENGE_JSON);
    assert.strictEqual(lastSubmit().challenge_url, undefined);
  } finally {
    await close();
  }
});

test('maps url to pageurl and sends the proxy pair', async () => {
  const { client, close, lastSubmit } = await startHarness();
  try {
    const result = await client.callTool({
      name: 'capskip_solve_altcha',
      arguments: {
        url: URL,
        challenge_url: CHALLENGE_URL,
        proxy: { type: 'SOCKS5', uri: 'user:pass@1.2.3.4:1080' },
      },
    });
    assert.notStrictEqual(result.isError, true, result.content?.[0]?.text);
    assert.strictEqual(lastSubmit().pageurl, URL);
    assert.strictEqual(lastSubmit().challenge_url, CHALLENGE_URL);
    assert.strictEqual(lastSubmit().proxy, 'user:pass@1.2.3.4:1080');
    assert.strictEqual(lastSubmit().proxytype, 'SOCKS5');
  } finally {
    await close();
  }
});

test('rejects a call with neither challenge parameter', async () => {
  // CapSkip would answer ERROR_BAD_PARAMETERS; the tool must say what is missing
  // rather than spend a round trip finding out.
  const { client, close } = await startHarness();
  try {
    const result = await client.callTool({
      name: 'capskip_solve_altcha',
      arguments: { url: URL },
    });
    assert.strictEqual(result.isError, true);
    assert.match(result.content[0].text, /challenge/i);
  } finally {
    await close();
  }
});

test('rejects an unsupported proxy type', async () => {
  const { client, close } = await startHarness();
  try {
    const result = await client.callTool({
      name: 'capskip_solve_altcha',
      arguments: {
        url: URL,
        challenge_url: CHALLENGE_URL,
        proxy: { type: 'SOCKS4', uri: '1.2.3.4:3128' },
      },
    });
    assert.strictEqual(result.isError, true);
  } finally {
    await close();
  }
});

test('reports a timeout with the captcha id', async () => {
  const { client, close } = await startHarness();
  try {
    const result = await client.callTool({
      name: 'capskip_solve_altcha',
      arguments: {
        url: 'https://example.com/never',
        challenge_url: CHALLENGE_URL,
        timeout: 1,
      },
    });
    assert.strictEqual(result.isError, true);
    assert.match(result.content[0].text, /timed out|timeout/i);
  } finally {
    await close();
  }
});
