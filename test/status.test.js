'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { startHarness } = require('../test-helpers/harness.js');

test('all five tools are advertised with the capskip_ prefix', async () => {
  const { client, close } = await startHarness();
  try {
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    assert.deepStrictEqual(names, [
      'capskip_solve_geetest',
      'capskip_solve_image_captcha',
      'capskip_solve_recaptcha',
      'capskip_solve_turnstile',
      'capskip_status',
    ]);
  } finally {
    await close();
  }
});

test('status reports reachable when CapSkip answers', async () => {
  const { client, close, mock } = await startHarness();
  try {
    const result = await client.callTool({ name: 'capskip_status', arguments: {} });
    assert.notStrictEqual(result.isError, true);
    assert.strictEqual(result.structuredContent.reachable, true);
    assert.strictEqual(result.structuredContent.port, mock.port);
    assert.ok(typeof result.structuredContent.latencyMs === 'number');
  } finally {
    await close();
  }
});

test('status reports unreachable with guidance, not an error result', async () => {
  // Port 1 on loopback refuses connections.
  const { client, close } = await startHarness({ port: 1 });
  try {
    const result = await client.callTool({ name: 'capskip_status', arguments: {} });
    assert.notStrictEqual(result.isError, true, 'status reports, it does not fail');
    assert.strictEqual(result.structuredContent.reachable, false);
    assert.match(result.structuredContent.detail, /desktop app/i);
  } finally {
    await close();
  }
});

test('status takes no arguments and rejects any that are passed', async () => {
  const { client, close } = await startHarness();
  try {
    const result = await client.callTool({ name: 'capskip_status', arguments: { host: 'x' } });
    assert.strictEqual(result.isError, true);
    assert.match(result.content[0].text, /host/);
  } finally {
    await close();
  }
});
