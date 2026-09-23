'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { startHarness } = require('../test-helpers/harness.js');
const { CAPTCHAFOX_TOKEN, CAPTCHAFOX_USER_AGENT } = require('../test-helpers/mockServer.js');

const URL = 'https://example.com/signup';
const SITEKEY = 'sk_xtNxpk6fCdFbxh1_xJeGflSdCE9tn99G';
const MAM_API_SERVER = 'https://s.uicdn.com/mampkg/@mamdev/core.frontend.libs.captchafox/';

test('solves a CaptchaFox challenge', async () => {
  const { client, close } = await startHarness();
  try {
    const result = await client.callTool({
      name: 'capskip_solve_captchafox',
      arguments: { sitekey: SITEKEY, url: URL },
    });
    assert.notStrictEqual(result.isError, true, result.content?.[0]?.text);
    assert.strictEqual(result.structuredContent.code, CAPTCHAFOX_TOKEN);
    assert.strictEqual(result.structuredContent.token, CAPTCHAFOX_TOKEN);
    assert.ok(result.structuredContent.captchaId);
  } finally {
    await close();
  }
});

test('reports the User-Agent the token was minted under', async () => {
  // CapSkip solves in its own browser, so the token is bound to that browser's
  // UA and not to anything the caller sent. A client that submits under its own
  // UA gets a token the site rejects, which looks like a bad solve.
  const { client, close } = await startHarness();
  try {
    const result = await client.callTool({
      name: 'capskip_solve_captchafox',
      arguments: { sitekey: SITEKEY, url: URL },
    });
    assert.strictEqual(result.structuredContent.userAgent, CAPTCHAFOX_USER_AGENT);
    assert.match(result.content[0].text, /User-Agent/);
  } finally {
    await close();
  }
});

test('names the form field in the text reply', async () => {
  // An agent acts on the text, not the structured content.
  const { client, close } = await startHarness();
  try {
    const result = await client.callTool({
      name: 'capskip_solve_captchafox',
      arguments: { sitekey: SITEKEY, url: URL },
    });
    assert.match(result.content[0].text, /cf-captcha-response/);
  } finally {
    await close();
  }
});

test('forwards the MAM widget source', async () => {
  // The widget source decides the token format, and sending the wrong one fails
  // silently at the target site rather than erroring here.
  const { client, close } = await startHarness();
  try {
    const result = await client.callTool({
      name: 'capskip_solve_captchafox',
      arguments: { sitekey: SITEKEY, url: URL, api_server: MAM_API_SERVER },
    });
    assert.notStrictEqual(result.isError, true, result.content?.[0]?.text);
    assert.strictEqual(result.structuredContent.token, CAPTCHAFOX_TOKEN);
  } finally {
    await close();
  }
});

test('accepts a proxy', async () => {
  const { client, close } = await startHarness();
  try {
    const result = await client.callTool({
      name: 'capskip_solve_captchafox',
      arguments: {
        sitekey: SITEKEY,
        url: URL,
        proxy: { type: 'HTTP', uri: 'login:password@1.2.3.4:8080' },
      },
    });
    assert.notStrictEqual(result.isError, true, result.content?.[0]?.text);
  } finally {
    await close();
  }
});

test('rejects SOCKS4, which CapSkip cannot route', async () => {
  const { client, close } = await startHarness();
  try {
    const result = await client.callTool({
      name: 'capskip_solve_captchafox',
      arguments: {
        sitekey: SITEKEY,
        url: URL,
        proxy: { type: 'SOCKS4', uri: '1.2.3.4:1080' },
      },
    });
    assert.strictEqual(result.isError, true);
  } finally {
    await close();
  }
});

test('rejects a url that is not a url', async () => {
  const { client, close } = await startHarness();
  try {
    const result = await client.callTool({
      name: 'capskip_solve_captchafox',
      arguments: { sitekey: SITEKEY, url: 'not-a-url' },
    });
    assert.strictEqual(result.isError, true);
  } finally {
    await close();
  }
});
