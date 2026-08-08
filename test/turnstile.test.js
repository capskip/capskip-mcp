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

test('accepts challenge-page fields', async () => {
  const { client, close } = await startHarness();
  try {
    const result = await client.callTool({
      name: 'capskip_solve_turnstile',
      arguments: {
        sitekey: '0x4AAAAAAA', url: 'https://example.com',
        action: 'managed', cdata: 'abc123', pagedata: 'zzz999',
      },
    });
    assert.notStrictEqual(result.isError, true, result.content?.[0]?.text);
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
