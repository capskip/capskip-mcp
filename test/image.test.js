'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { startHarness } = require('../test-helpers/harness.js');
const { CODE } = require('../test-helpers/mockServer.js');

const TINY_PNG_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwC'
  + 'AAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

test('solves an image captcha from a data URI', async () => {
  const { client, close } = await startHarness();
  try {
    const result = await client.callTool({
      name: 'capskip_solve_image_captcha',
      arguments: { image: TINY_PNG_DATA_URI },
    });
    assert.notStrictEqual(result.isError, true, result.content?.[0]?.text);
    assert.strictEqual(result.structuredContent.code, CODE);
    assert.ok(result.structuredContent.captchaId);
    assert.ok(typeof result.structuredContent.solveSeconds === 'number');
    assert.match(result.content[0].text, new RegExp(CODE));
  } finally {
    await close();
  }
});

test('rejects a proxy, which CapSkip does not support for images', async () => {
  const { client, close } = await startHarness();
  try {
    const result = await client.callTool({
      name: 'capskip_solve_image_captcha',
      arguments: { image: TINY_PNG_DATA_URI, proxy: { type: 'HTTP', uri: '1.2.3.4:3128' } },
    });
    assert.strictEqual(result.isError, true);
    assert.match(result.content[0].text, /proxy/i);
  } finally {
    await close();
  }
});

test('requires the image argument', async () => {
  const { client, close } = await startHarness();
  try {
    const result = await client.callTool({
      name: 'capskip_solve_image_captcha',
      arguments: {},
    });
    assert.strictEqual(result.isError, true);
    assert.match(result.content[0].text, /image/);
  } finally {
    await close();
  }
});

test('rejects a timeout above 600', async () => {
  const { client, close } = await startHarness();
  try {
    const result = await client.callTool({
      name: 'capskip_solve_image_captcha',
      arguments: { image: TINY_PNG_DATA_URI, timeout: 9999 },
    });
    assert.strictEqual(result.isError, true);
    assert.match(result.content[0].text, /600/);
  } finally {
    await close();
  }
});

test('reports unreachable CapSkip with actionable guidance', async () => {
  const { client, close } = await startHarness({ port: 1 });
  try {
    const result = await client.callTool({
      name: 'capskip_solve_image_captcha',
      arguments: { image: TINY_PNG_DATA_URI },
    });
    assert.strictEqual(result.isError, true);
    assert.match(result.content[0].text, /not reachable/i);
  } finally {
    await close();
  }
});
