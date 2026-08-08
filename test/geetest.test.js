'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { startHarness } = require('../test-helpers/harness.js');
const { CODE } = require('../test-helpers/mockServer.js');

test('solves GeeTest with gt, challenge, and url', async () => {
  const { client, close } = await startHarness();
  try {
    const result = await client.callTool({
      name: 'capskip_solve_geetest',
      arguments: {
        gt: '81388ea1fc187e0c335c0a8907ff2625',
        challenge: '7cf6a8b1a2c34d5e6f7089abcdef0123',
        url: 'https://example.com/login',
      },
    });
    assert.notStrictEqual(result.isError, true, result.content?.[0]?.text);
    assert.strictEqual(result.structuredContent.code, CODE);
    assert.ok(result.structuredContent.captchaId);
  } finally {
    await close();
  }
});

test('accepts a custom api_server', async () => {
  const { client, close } = await startHarness();
  try {
    const result = await client.callTool({
      name: 'capskip_solve_geetest',
      arguments: {
        gt: 'gtvalue', challenge: 'challengevalue',
        url: 'https://example.com/login', api_server: 'api-na.geetest.com',
      },
    });
    assert.notStrictEqual(result.isError, true, result.content?.[0]?.text);
  } finally {
    await close();
  }
});

test('requires gt, challenge, and url', async () => {
  const { client, close } = await startHarness();
  try {
    const cases = [
      { missing: 'gt', args: { challenge: 'c', url: 'https://example.com' } },
      { missing: 'challenge', args: { gt: 'g', url: 'https://example.com' } },
      { missing: 'url', args: { gt: 'g', challenge: 'c' } },
    ];

    for (const { missing, args } of cases) {
      const result = await client.callTool({ name: 'capskip_solve_geetest', arguments: args });
      assert.strictEqual(result.isError, true, JSON.stringify(args));
      // Asserting the field name matters: without it the test would pass even
      // if all three combinations were rejected for the same wrong reason.
      assert.match(result.content[0].text, new RegExp(`at ${missing}`), JSON.stringify(args));
    }
  } finally {
    await close();
  }
});

test('rejects an unknown key', async () => {
  const { client, close } = await startHarness();
  try {
    const result = await client.callTool({
      name: 'capskip_solve_geetest',
      arguments: {
        gt: 'g', challenge: 'c', url: 'https://example.com', sitekey: 'nope',
      },
    });
    assert.strictEqual(result.isError, true);
    assert.match(result.content[0].text, /sitekey/);
  } finally {
    await close();
  }
});

test('the description warns that challenge expires', async () => {
  const { client, close } = await startHarness();
  try {
    const tool = (await client.listTools()).tools.find((t) => t.name === 'capskip_solve_geetest');
    assert.match(tool.description, /expire/i);
  } finally {
    await close();
  }
});
