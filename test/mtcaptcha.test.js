'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { startHarness } = require('../test-helpers/harness.js');
const { MTCAPTCHA_TOKEN } = require('../test-helpers/mockServer.js');

const URL = 'https://2captcha.com/demo/mtcaptcha';
const SITEKEY = 'MTPublic-KzqLY1cKH';

async function solve(args, run) {
  const harness = await startHarness();
  try {
    const result = await harness.client.callTool({ name: 'capskip_solve_mtcaptcha', arguments: args });
    await run(result, harness);
  } finally {
    await harness.close();
  }
}

test('solves an MTCaptcha widget', async () => {
  await solve({ sitekey: SITEKEY, url: URL }, (result, { lastSubmit }) => {
    assert.notStrictEqual(result.isError, true, result.content?.[0]?.text);
    assert.strictEqual(result.structuredContent.code, MTCAPTCHA_TOKEN);
    assert.strictEqual(result.structuredContent.token, MTCAPTCHA_TOKEN);
    assert.ok(result.structuredContent.captchaId);
    assert.strictEqual(typeof result.structuredContent.solveSeconds, 'number');

    const sent = lastSubmit();
    assert.strictEqual(sent.method, 'mt_captcha');
    assert.strictEqual(sent.sitekey, SITEKEY);
    assert.strictEqual(sent.pageurl, URL);
    assert.strictEqual(sent.action, undefined);
    assert.strictEqual(sent.useragent, undefined);
  });
});

test('names the form field in the text reply', async () => {
  // An agent acts on the text, not the structured content.
  await solve({ sitekey: SITEKEY, url: URL }, (result) => {
    const text = result.content[0].text;
    assert.match(text, /mtcaptcha-verifiedtoken/);
    assert.ok(text.includes(MTCAPTCHA_TOKEN));
  });
});

test('forwards the action, a User-Agent and a proxy', async () => {
  await solve({
    sitekey: SITEKEY,
    url: URL,
    action: 'login',
    userAgent: 'Mozilla/5.0 (caller)',
    proxy: { type: 'SOCKS5', uri: 'login:password@1.2.3.4:1080' },
  }, (result, { lastSubmit }) => {
    assert.notStrictEqual(result.isError, true, result.content?.[0]?.text);
    const sent = lastSubmit();
    assert.strictEqual(sent.action, 'login');
    assert.strictEqual(sent.useragent, 'Mozilla/5.0 (caller)');
    assert.strictEqual(sent.proxy, 'login:password@1.2.3.4:1080');
    assert.strictEqual(sent.proxytype, 'SOCKS5');
    // The proxy's login is never echoed back.
    assert.ok(!result.content[0].text.includes('password'));
  });
});

test('accepts a sitekey copied as sk=MTPublic-…', async () => {
  await solve({ sitekey: `sk=${SITEKEY}`, url: URL }, (result, { lastSubmit }) => {
    assert.notStrictEqual(result.isError, true, result.content?.[0]?.text);
    assert.strictEqual(lastSubmit().sitekey, SITEKEY);
  });
});

test('rejects a sitekey that is not an MTCaptcha one, before anything is sent', async () => {
  await solve({ sitekey: 'KzqLY1cKH', url: URL }, (result, { lastSubmit }) => {
    assert.strictEqual(result.isError, true);
    assert.strictEqual(lastSubmit(), null);
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
  await solve({ sitekey: SITEKEY, url: URL, invisible: true }, (result) => {
    assert.strictEqual(result.isError, true);
  });
});

test('is advertised with an output schema and non-destructive hints', async () => {
  const { client, close } = await startHarness();
  try {
    const tool = (await client.listTools()).tools.find((t) => t.name === 'capskip_solve_mtcaptcha');
    assert.ok(tool, 'capskip_solve_mtcaptcha is listed');
    assert.ok(tool.outputSchema.properties.token);
    assert.strictEqual(tool.annotations.destructiveHint, false);
    assert.match(tool.description, /mtcaptcha-verifiedtoken/);
    assert.match(tool.description, /MTPublic-/);
  } finally {
    await close();
  }
});
