'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { startHarness } = require('../test-helpers/harness.js');
const { CODE, USER_AGENT } = require('../test-helpers/mockServer.js');

test('solves a Turnstile widget and names the response field', async () => {
  const { client, close } = await startHarness();
  try {
    const result = await client.callTool({
      name: 'capskip_solve_turnstile',
      arguments: { sitekey: '0x4AAAAAAA', url: 'https://example.com' },
    });
    assert.notStrictEqual(result.isError, true, result.content?.[0]?.text);
    assert.strictEqual(result.structuredContent.code, CODE);
    assert.match(result.content[0].text, /cf-turnstile-response/);
  } finally {
    await close();
  }
});

test('surfaces the userAgent the token must be submitted with', async () => {
  const { client, close } = await startHarness();
  try {
    const result = await client.callTool({
      name: 'capskip_solve_turnstile',
      arguments: { sitekey: '0x4AAAAAAA', url: 'https://example.com' },
    });
    assert.strictEqual(result.structuredContent.userAgent, USER_AGENT);
    assert.match(result.content[0].text, new RegExp(USER_AGENT));
    assert.match(result.content[0].text, /User-Agent/);
  } finally {
    await close();
  }
});

test('challenge-page fields reach in.php with cdata mapped to data', async () => {
  // cdata -> data is the one non-obvious rename in the codebase. Distinct values
  // are used so a cross-mapped implementation (cdata -> pagedata and
  // pagedata -> data) fails here: it would pass a mere "was not rejected" check,
  // since both names are valid Turnstile parameters.
  const { client, close, lastSubmit } = await startHarness();
  try {
    const result = await client.callTool({
      name: 'capskip_solve_turnstile',
      arguments: {
        sitekey: '0x4AAAAAAA', url: 'https://example.com',
        action: 'managed', cdata: 'abc123', pagedata: 'zzz999',
      },
    });
    assert.notStrictEqual(result.isError, true, result.content?.[0]?.text);

    const sent = lastSubmit();
    assert.strictEqual(sent.data, 'abc123', 'cdata must arrive as data');
    assert.strictEqual(sent.pagedata, 'zzz999', 'pagedata must arrive unchanged');
    assert.strictEqual(sent.action, 'managed');
    assert.strictEqual(sent.sitekey, '0x4AAAAAAA');
    assert.strictEqual(sent.method, 'turnstile');
    // cdata is the MCP-facing spelling only; CapSkip never sees it.
    assert.strictEqual(sent.cdata, undefined);
  } finally {
    await close();
  }
});

test('rejects an unknown key', async () => {
  const { client, close } = await startHarness();
  try {
    const result = await client.callTool({
      name: 'capskip_solve_turnstile',
      arguments: { sitekey: '0x4AAAAAAA', url: 'https://example.com', googlekey: 'nope' },
    });
    assert.strictEqual(result.isError, true);
    assert.match(result.content[0].text, /googlekey/);
  } finally {
    await close();
  }
});

test('requires sitekey and url', async () => {
  const { client, close } = await startHarness();
  try {
    const result = await client.callTool({
      name: 'capskip_solve_turnstile',
      arguments: { sitekey: '0x4AAAAAAA' },
    });
    assert.strictEqual(result.isError, true);
    assert.match(result.content[0].text, /url/);
  } finally {
    await close();
  }
});
