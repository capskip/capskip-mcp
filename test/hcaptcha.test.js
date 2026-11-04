'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { startHarness } = require('../test-helpers/harness.js');
const {
  HCAPTCHA_TOKEN,
  HCAPTCHA_RESP_KEY,
  HCAPTCHA_USER_AGENT,
} = require('../test-helpers/mockServer.js');

const URL = 'https://accounts.hcaptcha.com/demo';
const SITEKEY = 'a5f74b19-9e45-40e0-b45d-47ff91b7a6c2';
const RQDATA = 'Wk2qT7bX+fV9rL0pZ3mN8cJ1hYsD6uE4gA5oR2iK/0=';

async function solve(args, run) {
  const harness = await startHarness();
  try {
    const result = await harness.client.callTool({ name: 'capskip_solve_hcaptcha', arguments: args });
    await run(result, harness);
  } finally {
    await harness.close();
  }
}

test('solves an hCaptcha widget', async () => {
  await solve({ sitekey: SITEKEY, url: URL }, (result, { lastSubmit }) => {
    assert.notStrictEqual(result.isError, true, result.content?.[0]?.text);
    assert.strictEqual(result.structuredContent.code, HCAPTCHA_TOKEN);
    assert.strictEqual(result.structuredContent.token, HCAPTCHA_TOKEN);
    assert.strictEqual(result.structuredContent.respKey, HCAPTCHA_RESP_KEY);
    assert.strictEqual(result.structuredContent.userAgent, HCAPTCHA_USER_AGENT);
    assert.ok(result.structuredContent.captchaId);

    const sent = lastSubmit();
    assert.strictEqual(sent.method, 'hcaptcha');
    assert.strictEqual(sent.sitekey, SITEKEY);
    assert.strictEqual(sent.pageurl, URL);
    assert.strictEqual(sent.invisible, undefined);
    assert.strictEqual(sent.data, undefined);
  });
});

test('names both form fields, the User-Agent and the expiry in the text reply', async () => {
  // An agent acts on the text, not the structured content.
  await solve({ sitekey: SITEKEY, url: URL }, (result) => {
    const text = result.content[0].text;
    assert.match(text, /h-captcha-response/);
    assert.match(text, /g-recaptcha-response/);
    assert.match(text, /data-callback/);
    assert.ok(text.includes(HCAPTCHA_TOKEN));
    assert.ok(text.includes(HCAPTCHA_USER_AGENT));
    assert.match(text, /two minutes/);
  });
});

test('sends an invisible Enterprise widget with its rqdata', async () => {
  await solve({ sitekey: SITEKEY, url: URL, invisible: true, data: RQDATA }, (result, { lastSubmit }) => {
    assert.notStrictEqual(result.isError, true, result.content?.[0]?.text);
    const sent = lastSubmit();
    // The mock, like CapSkip, refuses any invisible other than 1/true.
    assert.strictEqual(sent.invisible, '1');
    assert.strictEqual(sent.data, RQDATA);
  });
});

test('invisible: false is not sent', async () => {
  await solve({ sitekey: SITEKEY, url: URL, invisible: false }, (result, { lastSubmit }) => {
    assert.notStrictEqual(result.isError, true, result.content?.[0]?.text);
    assert.strictEqual(lastSubmit().invisible, undefined);
  });
});

test('forwards a User-Agent and a proxy', async () => {
  await solve({
    sitekey: SITEKEY,
    url: URL,
    userAgent: 'Mozilla/5.0 (caller)',
    proxy: { type: 'SOCKS5', uri: 'login:password@1.2.3.4:1080' },
  }, (result, { lastSubmit }) => {
    assert.notStrictEqual(result.isError, true, result.content?.[0]?.text);
    const sent = lastSubmit();
    assert.strictEqual(sent.useragent, 'Mozilla/5.0 (caller)');
    assert.strictEqual(sent.proxy, 'login:password@1.2.3.4:1080');
    assert.strictEqual(sent.proxytype, 'SOCKS5');
    // The proxy's login is never echoed back.
    assert.ok(!result.content[0].text.includes('password'));
  });
});

test('rejects SOCKS4, which CapSkip cannot route', async () => {
  await solve({ sitekey: SITEKEY, url: URL, proxy: { type: 'SOCKS4', uri: '1.2.3.4:1080' } }, (result) => {
    assert.strictEqual(result.isError, true);
  });
});

test('rejects a url that is not a url', async () => {
  await solve({ sitekey: SITEKEY, url: 'not-a-url' }, (result) => {
    assert.strictEqual(result.isError, true);
  });
});

test('rejects an empty sitekey', async () => {
  await solve({ sitekey: '', url: URL }, (result) => {
    assert.strictEqual(result.isError, true);
  });
});

test('rejects parameters the tool does not take', async () => {
  // 2Captcha's `domain` is not part of CapSkip's hCaptcha API.
  await solve({ sitekey: SITEKEY, url: URL, domain: 'js.hcaptcha.com' }, (result) => {
    assert.strictEqual(result.isError, true);
  });
});

test('is advertised with an output schema and non-destructive hints', async () => {
  const { client, close } = await startHarness();
  try {
    const tool = (await client.listTools()).tools.find((t) => t.name === 'capskip_solve_hcaptcha');
    assert.ok(tool, 'capskip_solve_hcaptcha is listed');
    assert.ok(tool.outputSchema.properties.respKey);
    assert.ok(tool.outputSchema.properties.token);
    assert.strictEqual(tool.annotations.destructiveHint, false);
    assert.match(tool.description, /h-captcha/);
  } finally {
    await close();
  }
});
