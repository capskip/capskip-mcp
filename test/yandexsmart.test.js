'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { startHarness } = require('../test-helpers/harness.js');
const { YANDEX_TOKEN } = require('../test-helpers/mockServer.js');

const URL = 'https://smartcaptcha.yandexcloud.net/demo';
const SITEKEY = 'ysc1_DAo8nFPdNCMHkAwYxIUJFxW5IIJd99BBfeeeee';

async function solve(args, run) {
  const harness = await startHarness();
  try {
    const result = await harness.client.callTool({ name: 'capskip_solve_yandex_smart', arguments: args });
    await run(result, harness);
  } finally {
    await harness.close();
  }
}

test('solves a Yandex SmartCaptcha widget', async () => {
  await solve({ sitekey: SITEKEY, url: URL }, (result, { lastSubmit }) => {
    assert.notStrictEqual(result.isError, true, result.content?.[0]?.text);
    assert.strictEqual(result.structuredContent.code, YANDEX_TOKEN);
    assert.strictEqual(result.structuredContent.token, YANDEX_TOKEN);
    assert.ok(result.structuredContent.captchaId);
    assert.strictEqual(typeof result.structuredContent.solveSeconds, 'number');

    const sent = lastSubmit();
    assert.strictEqual(sent.method, 'yandex');
    assert.strictEqual(sent.sitekey, SITEKEY);
    assert.strictEqual(sent.pageurl, URL);
    assert.strictEqual(sent.useragent, undefined);
  });
});

test('names the form field in the text reply', async () => {
  // An agent acts on the text, not the structured content.
  await solve({ sitekey: SITEKEY, url: URL }, (result) => {
    const text = result.content[0].text;
    assert.match(text, /smart-token/);
    assert.ok(text.includes(YANDEX_TOKEN));
  });
});

test('accepts an older sitekey without the ysc1_ prefix', async () => {
  await solve({ sitekey: 'FEXfAbHQsToo97VidNVk3j4dC74nGW1DgdxjtNB9', url: URL }, (result) => {
    assert.notStrictEqual(result.isError, true, result.content?.[0]?.text);
  });
});

test('forwards a User-Agent and a proxy', async () => {
  await solve({
    sitekey: SITEKEY,
    url: URL,
    userAgent: 'Mozilla/5.0 (caller)',
    proxy: { type: 'HTTPS', uri: 'login:password@203.0.113.7:3128' },
  }, (result, { lastSubmit }) => {
    assert.notStrictEqual(result.isError, true, result.content?.[0]?.text);
    const sent = lastSubmit();
    assert.strictEqual(sent.useragent, 'Mozilla/5.0 (caller)');
    assert.strictEqual(sent.proxy, 'login:password@203.0.113.7:3128');
    assert.strictEqual(sent.proxytype, 'HTTPS');
    // The proxy's login is never echoed back.
    assert.ok(!result.content[0].text.includes('password'));
  });
});

test('rejects a sitekey that is not a SmartCaptcha one, before anything is sent', async () => {
  await solve({ sitekey: 'too-short', url: URL }, (result, { lastSubmit }) => {
    assert.strictEqual(result.isError, true);
    assert.strictEqual(lastSubmit(), null);
  });
});

test('rejects SOCKS4, which CapSkip cannot route', async () => {
  await solve({ sitekey: SITEKEY, url: URL, proxy: { type: 'SOCKS4', uri: '203.0.113.7:1080' } }, (result) => {
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
  await solve({ sitekey: SITEKEY, url: URL, action: 'login' }, (result) => {
    assert.strictEqual(result.isError, true);
  });
});

test('is advertised with an output schema and non-destructive hints', async () => {
  const { client, close } = await startHarness();
  try {
    const tool = (await client.listTools()).tools.find((t) => t.name === 'capskip_solve_yandex_smart');
    assert.ok(tool, 'capskip_solve_yandex_smart is listed');
    assert.ok(tool.outputSchema.properties.token);
    assert.strictEqual(tool.annotations.destructiveHint, false);
    assert.match(tool.description, /smart-token/);
    assert.match(tool.description, /ysc1_/);
  } finally {
    await close();
  }
});
