'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { startHarness } = require('../test-helpers/harness.js');
const { CAPY_SOLUTION } = require('../test-helpers/mockServer.js');

const URL = 'https://example.com/login';
const SITEKEY = 'PUZZLE_Abc1dEFghIJKLM2no34P56q7rStu8v';

test('solves a Capy puzzle', async () => {
  const { client, close } = await startHarness();
  try {
    const result = await client.callTool({
      name: 'capskip_solve_capy',
      arguments: { sitekey: SITEKEY, url: URL },
    });
    assert.notStrictEqual(result.isError, true, result.content?.[0]?.text);
    assert.ok(result.structuredContent.captchaId);
  } finally {
    await close();
  }
});

test('exposes the three form values rather than a token', async () => {
  // This is the whole reason capskip_solve_capy has its own output schema: a
  // Capy answer is not a token, and a client that reads only `code` would post
  // a JSON blob into a field expecting a drag path.
  const { client, close } = await startHarness();
  try {
    const result = await client.callTool({
      name: 'capskip_solve_capy',
      arguments: { sitekey: SITEKEY, url: URL },
    });
    assert.notStrictEqual(result.isError, true, result.content?.[0]?.text);

    assert.strictEqual(result.structuredContent.captchakey, CAPY_SOLUTION.captchakey);
    assert.strictEqual(result.structuredContent.challengekey, CAPY_SOLUTION.challengekey);
    assert.strictEqual(result.structuredContent.answer, CAPY_SOLUTION.answer);
    assert.strictEqual(result.structuredContent.respKey, '');
  } finally {
    await close();
  }
});

test('names all three form fields in the text reply', async () => {
  // An agent acts on the text, not the structured content, so the field names
  // have to be there — posting only capy_answer fails as silently as posting
  // nothing.
  const { client, close } = await startHarness();
  try {
    const result = await client.callTool({
      name: 'capskip_solve_capy',
      arguments: { sitekey: SITEKEY, url: URL },
    });
    const text = result.content[0].text;

    assert.match(text, /capy_captchakey/);
    assert.match(text, /capy_challengekey/);
    assert.match(text, /capy_answer/);
    assert.match(text, /NOT a token/);
  } finally {
    await close();
  }
});

test('keeps the raw answer as JSON in code', async () => {
  // `code` is declared a string, so the object answer has to be serialized
  // rather than rendered as [object Object].
  const { client, close } = await startHarness();
  try {
    const result = await client.callTool({
      name: 'capskip_solve_capy',
      arguments: { sitekey: SITEKEY, url: URL },
    });
    const parsed = JSON.parse(result.structuredContent.code);

    assert.strictEqual(parsed.answer, CAPY_SOLUTION.answer);
    assert.strictEqual(parsed.challengekey, CAPY_SOLUTION.challengekey);
  } finally {
    await close();
  }
});

test('forwards api_server', async () => {
  const { client, close } = await startHarness();
  try {
    const result = await client.callTool({
      name: 'capskip_solve_capy',
      arguments: { sitekey: SITEKEY, url: URL, api_server: 'https://jp.api.capy.me/' },
    });
    assert.notStrictEqual(result.isError, true, result.content?.[0]?.text);
    assert.strictEqual(result.structuredContent.answer, CAPY_SOLUTION.answer);
  } finally {
    await close();
  }
});

test('rejects an unknown argument', async () => {
  // The input schema is strict: a caller that invents `version: "avatar"` is
  // told so here rather than having it silently dropped.
  const { client, close } = await startHarness();
  try {
    const result = await client.callTool({
      name: 'capskip_solve_capy',
      arguments: { sitekey: SITEKEY, url: URL, version: 'avatar' },
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
      name: 'capskip_solve_capy',
      arguments: { sitekey: SITEKEY, url: 'not-a-url' },
    });
    assert.strictEqual(result.isError, true);
  } finally {
    await close();
  }
});
