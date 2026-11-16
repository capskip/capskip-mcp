'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { startHarness } = require('../test-helpers/harness.js');
const { GEETEST_V4_CODE, GEETEST_V4_SOLUTION } = require('../test-helpers/mockServer.js');

const URL = 'https://gt4.geetest.com/';
const CAPTCHA_ID = '54088bb07d2df3c46b79f80300b0abbe';
const FIELDS = ['captcha_id', 'lot_number', 'pass_token', 'gen_time', 'captcha_output'];

async function solve(args, run) {
  const harness = await startHarness();
  try {
    const result = await harness.client.callTool({ name: 'capskip_solve_geetest_v4', arguments: args });
    await run(result, harness);
  } finally {
    await harness.close();
  }
}

test('solves a GeeTest v4 widget and expands the five values', async () => {
  await solve({ captcha_id: CAPTCHA_ID, url: URL }, (result, { lastSubmit }) => {
    assert.notStrictEqual(result.isError, true, result.content?.[0]?.text);
    const out = result.structuredContent;
    assert.strictEqual(out.code, GEETEST_V4_CODE);
    for (const field of FIELDS) assert.strictEqual(out[field], GEETEST_V4_SOLUTION[field], field);
    assert.strictEqual(out.isOffline, undefined);
    assert.ok(out.captchaId);
    assert.strictEqual(typeof out.solveSeconds, 'number');

    const sent = lastSubmit();
    assert.strictEqual(sent.method, 'geetest_v4');
    assert.strictEqual(sent.captcha_id, CAPTCHA_ID);
    assert.strictEqual(sent.pageurl, URL);
    assert.strictEqual(sent.risk_type, undefined);
    assert.strictEqual(sent.gt, undefined);
  });
});

test('names every value in the text reply', async () => {
  // An agent acts on the text, not the structured content.
  await solve({ captcha_id: CAPTCHA_ID, url: URL }, (result) => {
    const text = result.content[0].text;
    for (const field of FIELDS) {
      assert.ok(text.includes(`${field}: ${GEETEST_V4_SOLUTION[field]}`), field);
    }
  });
});

test('forwards risk_type and a proxy', async () => {
  await solve({
    captcha_id: CAPTCHA_ID,
    url: URL,
    risk_type: 'slide',
    proxy: { type: 'SOCKS5H', uri: 'login:password@203.0.113.7:1080' },
  }, (result, { lastSubmit }) => {
    assert.notStrictEqual(result.isError, true, result.content?.[0]?.text);
    const sent = lastSubmit();
    assert.strictEqual(sent.risk_type, 'slide');
    assert.strictEqual(sent.proxy, 'login:password@203.0.113.7:1080');
    assert.strictEqual(sent.proxytype, 'SOCKS5H');
    // The proxy's login is never echoed back.
    assert.ok(!result.content[0].text.includes('password'));
  });
});

test('trims a captcha_id copied with whitespace', async () => {
  await solve({ captcha_id: `  ${CAPTCHA_ID}\n`, url: URL }, (result, { lastSubmit }) => {
    assert.notStrictEqual(result.isError, true, result.content?.[0]?.text);
    assert.strictEqual(lastSubmit().captcha_id, CAPTCHA_ID);
  });
});

test('reports an offline pass', async () => {
  await solve({ captcha_id: CAPTCHA_ID, url: 'https://example.com/offline' }, (result) => {
    assert.notStrictEqual(result.isError, true, result.content?.[0]?.text);
    assert.strictEqual(result.structuredContent.isOffline, true);
    assert.strictEqual(result.structuredContent.lot_number, GEETEST_V4_SOLUTION.lot_number);
    assert.match(result.content[0].text, /offline/);
  });
});

test('rejects an empty captcha_id, before anything is sent', async () => {
  await solve({ captcha_id: '   ', url: URL }, (result, { lastSubmit }) => {
    assert.strictEqual(result.isError, true);
    assert.strictEqual(lastSubmit(), null);
  });
});

test("rejects v3's gt and challenge", async () => {
  await solve({ captcha_id: CAPTCHA_ID, url: URL, gt: 'abc', challenge: 'def' }, (result, { lastSubmit }) => {
    assert.strictEqual(result.isError, true);
    assert.strictEqual(lastSubmit(), null);
  });
});

test('rejects SOCKS4, which CapSkip cannot route', async () => {
  await solve({ captcha_id: CAPTCHA_ID, url: URL, proxy: { type: 'SOCKS4', uri: '203.0.113.7:1080' } }, (result) => {
    assert.strictEqual(result.isError, true);
  });
});

test('rejects a url that is not a url', async () => {
  await solve({ captcha_id: CAPTCHA_ID, url: 'not-a-url' }, (result) => {
    assert.strictEqual(result.isError, true);
  });
});

test('is advertised with an output schema and non-destructive hints', async () => {
  const { client, close } = await startHarness();
  try {
    const tool = (await client.listTools()).tools.find((t) => t.name === 'capskip_solve_geetest_v4');
    assert.ok(tool, 'capskip_solve_geetest_v4 is listed');
    for (const field of FIELDS) assert.ok(tool.outputSchema.properties[field], field);
    assert.ok(tool.outputSchema.properties.isOffline);
    assert.strictEqual(tool.annotations.destructiveHint, false);
    assert.match(tool.description, /initGeetest4/);
    assert.match(tool.description, /capskip_solve_geetest\b/);
  } finally {
    await close();
  }
});
