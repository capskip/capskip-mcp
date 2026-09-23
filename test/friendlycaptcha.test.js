'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { startHarness } = require('../test-helpers/harness.js');
const {
  FRIENDLY_CAPTCHA_TOKEN, FRIENDLY_CAPTCHA_V2_TOKEN,
} = require('../test-helpers/mockServer.js');

const URL = 'https://example.com/signup';
const SITEKEY = 'FCMGEMUD2M567T8G';
const V2_MODULE_SCRIPT = 'https://cdn.example.com/@friendlycaptcha/sdk@0.1.6/site.min.js';

test('solves a Friendly Captcha', async () => {
  const { client, close } = await startHarness();
  try {
    const result = await client.callTool({
      name: 'capskip_solve_friendly_captcha',
      arguments: { sitekey: SITEKEY, url: URL, version: 'v1' },
    });
    assert.notStrictEqual(result.isError, true, result.content?.[0]?.text);
    assert.strictEqual(result.structuredContent.code, FRIENDLY_CAPTCHA_TOKEN);
    assert.strictEqual(result.structuredContent.token, FRIENDLY_CAPTCHA_TOKEN);
    assert.ok(result.structuredContent.captchaId);
  } finally {
    await close();
  }
});

test('names frc-captcha-solution for a v1 solve', async () => {
  // The form field differs between the two versions, and getting it wrong is the
  // single most common way a working v1 integration breaks on a v2 site. An
  // agent acts on the text, so the right field name has to be in it.
  const { client, close } = await startHarness();
  try {
    const result = await client.callTool({
      name: 'capskip_solve_friendly_captcha',
      arguments: { sitekey: SITEKEY, url: URL, version: 'v1' },
    });
    const text = result.content[0].text;

    assert.match(text, /frc-captcha-solution/);
    assert.doesNotMatch(text, /frc-captcha-response/);
  } finally {
    await close();
  }
});

test('names frc-captcha-response for a v2 solve', async () => {
  const { client, close } = await startHarness();
  try {
    const result = await client.callTool({
      name: 'capskip_solve_friendly_captcha',
      arguments: { sitekey: SITEKEY, url: URL, version: 'v2' },
    });
    const text = result.content[0].text;

    assert.match(text, /frc-captcha-response/);
    assert.doesNotMatch(text, /frc-captcha-solution/);
  } finally {
    await close();
  }
});

test('carries a large v2 token intact', async () => {
  // A v2 token is a single opaque string of roughly six kilobytes, so nothing
  // along the path may truncate it.
  const { client, close } = await startHarness();
  try {
    const result = await client.callTool({
      name: 'capskip_solve_friendly_captcha',
      arguments: { sitekey: SITEKEY, url: URL, version: 'v2' },
    });
    assert.strictEqual(result.structuredContent.token, FRIENDLY_CAPTCHA_V2_TOKEN);
    assert.strictEqual(
      result.structuredContent.token.length,
      FRIENDLY_CAPTCHA_V2_TOKEN.length,
    );
  } finally {
    await close();
  }
});

test('passes a v1 token through verbatim', async () => {
  // A v1 token's dot-separated parts include base64 padding and slashes;
  // nothing may trim or re-encode them.
  const { client, close } = await startHarness();
  try {
    const result = await client.callTool({
      name: 'capskip_solve_friendly_captcha',
      arguments: { sitekey: SITEKEY, url: URL, version: 'v1' },
    });
    const { token } = result.structuredContent;

    assert.strictEqual(token.split('.').length, 4);
    assert.ok(token.includes('/'));
    assert.ok(token.includes('='));
  } finally {
    await close();
  }
});

test('accepts the widget script instead of an explicit version', async () => {
  // The script URL is the most reliable version signal there is, because it is
  // the build the site actually loads.
  const { client, close } = await startHarness();
  try {
    const result = await client.callTool({
      name: 'capskip_solve_friendly_captcha',
      arguments: { sitekey: SITEKEY, url: URL, module_script: V2_MODULE_SCRIPT },
    });
    assert.notStrictEqual(result.isError, true, result.content?.[0]?.text);
    assert.ok(result.structuredContent.token);
  } finally {
    await close();
  }
});

test('accepts the eu data-residency tenant', async () => {
  const { client, close } = await startHarness();
  try {
    const result = await client.callTool({
      name: 'capskip_solve_friendly_captcha',
      arguments: { sitekey: SITEKEY, url: URL, version: 'v1', api_server: 'eu' },
    });
    assert.notStrictEqual(result.isError, true, result.content?.[0]?.text);
  } finally {
    await close();
  }
});

test('rejects a version the server does not know', async () => {
  // The enum refuses v3 at the schema, so a typo never reaches the server as a
  // silent default — solving the wrong version returns a well-formed token the
  // site rejects, with nothing to indicate why.
  const { client, close } = await startHarness();
  try {
    const result = await client.callTool({
      name: 'capskip_solve_friendly_captcha',
      arguments: { sitekey: SITEKEY, url: URL, version: 'v3' },
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
      name: 'capskip_solve_friendly_captcha',
      arguments: { sitekey: SITEKEY, url: 'not-a-url' },
    });
    assert.strictEqual(result.isError, true);
  } finally {
    await close();
  }
});
