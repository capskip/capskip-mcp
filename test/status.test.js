'use strict';

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

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

test('a decoy server that is not CapSkip is reported as unreachable', async () => {
  // Port 8080 is commonly occupied. Something that speaks HTTP but is not
  // CapSkip must not be reported as healthy, or capskip_status contradicts the
  // solve that fails against it seconds later.
  const decoy = http.createServer((req, res) => {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });
  await new Promise((resolve) => decoy.listen(0, '127.0.0.1', resolve));
  const decoyPort = decoy.address().port;

  const { client, close } = await startHarness({ port: decoyPort });
  try {
    const result = await client.callTool({ name: 'capskip_status', arguments: {} });
    assert.notStrictEqual(result.isError, true, 'status reports, it does not fail');
    assert.strictEqual(result.structuredContent.reachable, false);
    assert.strictEqual(result.structuredContent.port, decoyPort);
    assert.match(result.structuredContent.detail, new RegExp(`:${decoyPort}\\b`));
    assert.match(result.structuredContent.detail, /HTTP 404/);
    // Not the "nothing is there" wording — something *is* listening.
    assert.doesNotMatch(result.structuredContent.detail, /No response from/);
  } finally {
    await close();
    await new Promise((resolve) => decoy.close(resolve));
  }
});

test('a rejected API key is reported as reachable, pointing at CAPSKIP_API_KEY', async () => {
  // CapSkip is running — the key is what is wrong. Saying "not reachable" would
  // send the model looking for a process that is already there.
  const { client, close } = await startHarness({ apiKey: 'badkey' });
  try {
    const result = await client.callTool({ name: 'capskip_status', arguments: {} });
    assert.notStrictEqual(result.isError, true);
    assert.strictEqual(result.structuredContent.reachable, true);
    assert.match(result.structuredContent.detail, /CAPSKIP_API_KEY/);
    assert.match(result.structuredContent.detail, /rejected the API key/i);
    // The healthy wording must not be what a rejected key produces.
    assert.doesNotMatch(result.structuredContent.detail, /CapSkip answered/);
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
