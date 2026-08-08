'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

const ENTRY = path.join(__dirname, '..', 'dist', 'index.js');

test('the built entrypoint serves tools over stdio', async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [ENTRY, '--port', '8099'],
  });
  const client = new Client({ name: 'cli-test', version: '0.0.0' });

  await client.connect(transport);
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
    await client.close();
  }
});

test('an invalid port exits non-zero with a message naming the flag', async () => {
  const { spawnSync } = require('node:child_process');
  const proc = spawnSync(process.execPath, [ENTRY, '--port', 'abc'], { encoding: 'utf8' });
  assert.notStrictEqual(proc.status, 0);
  assert.match(proc.stderr, /--port/);
});

test('an unknown flag exits non-zero', async () => {
  const { spawnSync } = require('node:child_process');
  const proc = spawnSync(process.execPath, [ENTRY, '--bogus', 'x'], { encoding: 'utf8' });
  assert.notStrictEqual(proc.status, 0);
  assert.match(proc.stderr, /--bogus/);
});
