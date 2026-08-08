'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { SERVER_NAME, SERVER_VERSION } = require('../dist/server.js');
const pkg = require('../package.json');
const { startHarness } = require('../test-helpers/harness.js');

const SOLVE_TOOLS = [
  'capskip_solve_image_captcha',
  'capskip_solve_recaptcha',
  'capskip_solve_turnstile',
  'capskip_solve_geetest',
];

test('the advertised version matches package.json', async () => {
  // MCP clients display this. It is hand-written in server.ts, so it drifts from
  // the published version at the first patch release unless something checks.
  assert.strictEqual(SERVER_VERSION, pkg.version);

  const { client, close } = await startHarness();
  try {
    const advertised = client.getServerVersion();
    assert.strictEqual(advertised.version, pkg.version);
    assert.strictEqual(advertised.name, SERVER_NAME);
  } finally {
    await close();
  }
});

test('the solve tools are annotated as non-destructive', async () => {
  // destructiveHint defaults to true when readOnlyHint is false, so omitting it
  // marks these tools as potentially destructive and clients then refuse to
  // auto-approve them — defeating the point of a tool that exists so an agent
  // can get past a captcha without a human.
  const { client, close } = await startHarness();
  try {
    const tools = (await client.listTools()).tools;
    for (const name of SOLVE_TOOLS) {
      const tool = tools.find((t) => t.name === name);
      assert.ok(tool, `${name} is not registered`);
      assert.strictEqual(tool.annotations.destructiveHint, false, name);
      assert.strictEqual(tool.annotations.readOnlyHint, false, name);
    }
  } finally {
    await close();
  }
});

test('capskip_status is annotated read-only', async () => {
  const { client, close } = await startHarness();
  try {
    const tool = (await client.listTools()).tools.find((t) => t.name === 'capskip_status');
    assert.strictEqual(tool.annotations.readOnlyHint, true);
  } finally {
    await close();
  }
});

test('the instructions name the supported types and rule out hCaptcha', async () => {
  // hCaptcha renders as <div class="h-captcha" data-sitekey="…">. A model
  // scanning the DOM for data-sitekey cannot tell it from reCAPTCHA, so without
  // this it reaches for capskip_solve_recaptcha, burns a solve, and loops.
  const { client, close } = await startHarness();
  try {
    const instructions = client.getInstructions();
    assert.match(instructions, /hCaptcha/);
    assert.match(instructions, /FunCaptcha|Arkose/);
    assert.match(instructions, /cannot solve/i);
    for (const supported of [/image captcha/i, /reCAPTCHA/, /Turnstile/, /GeeTest/]) {
      assert.match(instructions, supported);
    }
  } finally {
    await close();
  }
});
