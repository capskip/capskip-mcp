'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { startHarness } = require('../test-helpers/harness.js');
const { AMAZON_WAF_SOLUTION } = require('../test-helpers/mockServer.js');

const TOOL = 'capskip_solve_amazon_waf';
const URL = 'https://www.example.com/';
const SITEKEY = 'AQIDAHjcYuEXAMPLEghicBgQ/7bFaQZ+m5FKCMDnO+vTbNg96AHDh0IR5vgzHNceHYqZR+GOAAAAfjB8';
const IV = 'CgAFRDIjfgAAA5yY';
const CONTEXT = 'Rbp3r8fvbuhmrCqpUe8Mh1TLvs8OSKJZiSs2vCF4dt9rxVZI7xYJa2n5k/9r+XaXe7KUIu2I8nXTDHHkDvIOTDc2';
const CHALLENGE_JS = 'https://3f2a9c7d41b0.edge.sdk.awswaf.com/3f2a9c7d41b0/8e51d0c7a2f4/challenge.js';
const WIDGET_KEY = 'Xr9kEXAMPLE2bWQx1vTq8LmZ0aYc4dHs7nFp3gJt6uKw5eRi9AbCdEfGh=_0_1';
const JSAPI_JS = 'https://5b7e0a19c3d8.us-east-1.captcha-sdk.awswaf.com/5b7e0a19c3d8/jsapi.js';

async function call(args) {
  const harness = await startHarness();
  const result = await harness.client.callTool({ name: TOOL, arguments: args });
  return { ...harness, result };
}

test('solves a challenge page and sends what the page carried', async () => {
  const { result, lastSubmit, close } = await call({
    sitekey: SITEKEY, url: URL, iv: IV, context: CONTEXT, challenge_script: CHALLENGE_JS,
  });
  try {
    assert.notStrictEqual(result.isError, true, result.content?.[0]?.text);
    assert.strictEqual(lastSubmit().method, 'amazon_waf');
    // The keys carry + / and =: they have to reach in.php intact.
    assert.strictEqual(lastSubmit().sitekey, SITEKEY);
    assert.strictEqual(lastSubmit().iv, IV);
    assert.strictEqual(lastSubmit().context, CONTEXT);
    assert.strictEqual(lastSubmit().pageurl, URL);
    assert.strictEqual(lastSubmit().challenge_script, CHALLENGE_JS);
  } finally {
    await close();
  }
});

test('exposes the voucher pair rather than a token', async () => {
  const { result, close } = await call({ sitekey: SITEKEY, url: URL });
  try {
    assert.notStrictEqual(result.isError, true, result.content?.[0]?.text);
    assert.strictEqual(result.structuredContent.captcha_voucher, AMAZON_WAF_SOLUTION.captcha_voucher);
    assert.strictEqual(result.structuredContent.existing_token, AMAZON_WAF_SOLUTION.existing_token);
    // `code` is declared a string, so the object answer is serialized.
    assert.deepStrictEqual(JSON.parse(result.structuredContent.code), AMAZON_WAF_SOLUTION);
  } finally {
    await close();
  }
});

test('the text reply says how to turn the pair into the cookie', async () => {
  // An agent acts on the text. Posting the voucher as the cookie fails silently,
  // so the reply names the exchange step and, when it can, the exact URL.
  const { result, close } = await call({
    sitekey: SITEKEY, url: URL, iv: IV, context: CONTEXT, challenge_script: CHALLENGE_JS,
  });
  try {
    const text = result.content[0].text;
    assert.match(text, /NOT the cookie/);
    assert.match(text, /aws-waf-token/);
    assert.ok(text.includes(CHALLENGE_JS.replace(/challenge\.js$/, 'voucher')), text);
    assert.ok(text.includes(AMAZON_WAF_SOLUTION.captcha_voucher));
    assert.ok(text.includes(AMAZON_WAF_SOLUTION.existing_token));
  } finally {
    await close();
  }
});

test('solves a widget page with jsapiScript and no iv/context', async () => {
  const { result, lastSubmit, close } = await call({
    sitekey: WIDGET_KEY, url: URL, jsapiScript: JSAPI_JS,
  });
  try {
    assert.notStrictEqual(result.isError, true, result.content?.[0]?.text);
    assert.strictEqual(lastSubmit().jsapiScript, JSAPI_JS);
    assert.strictEqual(lastSubmit().iv, undefined);
    assert.strictEqual(lastSubmit().context, undefined);
    assert.match(result.content[0].text, /voucher/);
  } finally {
    await close();
  }
});

test('forwards the proxy pair', async () => {
  const { result, lastSubmit, close } = await call({
    sitekey: SITEKEY, url: URL, proxy: { type: 'SOCKS5H', uri: 'user:pass@1.2.3.4:1080' },
  });
  try {
    assert.notStrictEqual(result.isError, true, result.content?.[0]?.text);
    assert.strictEqual(lastSubmit().proxy, 'user:pass@1.2.3.4:1080');
    assert.strictEqual(lastSubmit().proxytype, 'SOCKS5H');
  } finally {
    await close();
  }
});

test('refuses iv without context before anything is submitted', async () => {
  const { result, lastSubmit, close } = await call({ sitekey: SITEKEY, url: URL, iv: IV });
  try {
    assert.strictEqual(result.isError, true);
    assert.strictEqual(lastSubmit() ?? undefined, undefined);
  } finally {
    await close();
  }
});

test('refuses a script that is not on awswaf.com', async () => {
  const { result, lastSubmit, close } = await call({
    sitekey: SITEKEY, url: URL, challenge_script: 'https://evil.example.com/a/challenge.js',
  });
  try {
    assert.strictEqual(result.isError, true);
    assert.match(result.content[0].text, /awswaf\.com/);
    assert.strictEqual(lastSubmit() ?? undefined, undefined);
  } finally {
    await close();
  }
});

test('rejects an unknown argument', async () => {
  const { result, close } = await call({ sitekey: SITEKEY, url: URL, gt: 'x' });
  try {
    assert.strictEqual(result.isError, true);
  } finally {
    await close();
  }
});
