'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { startHarness } = require('../test-helpers/harness.js');
const {
  CODE, GEETEST_ANSWER, GEETEST_CHALLENGE, GEETEST_VALIDATE, GEETEST_SECCODE,
} = require('../test-helpers/mockServer.js');

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
    // `code` keeps the raw answer verbatim, which for GeeTest is the JSON string.
    assert.strictEqual(result.structuredContent.code, GEETEST_ANSWER);
    assert.ok(result.structuredContent.captchaId);
  } finally {
    await close();
  }
});

test('expands the GeeTest answer into challenge, validate, and seccode', async () => {
  // This is the whole reason capskip_solve_geetest has its own output schema:
  // the three geetest_* fields the target site's form actually wants. Asserting
  // the exact values proves they came from the parsed payload rather than from
  // the tool echoing something back.
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

    assert.strictEqual(result.structuredContent.challenge, GEETEST_CHALLENGE);
    assert.strictEqual(result.structuredContent.validate, GEETEST_VALIDATE);
    assert.strictEqual(result.structuredContent.seccode, GEETEST_SECCODE);

    const text = result.content[0].text;
    assert.match(text, new RegExp(`geetest_challenge: ${GEETEST_CHALLENGE}`));
    assert.match(text, new RegExp(`geetest_validate: ${GEETEST_VALIDATE}`));
    // The seccode carries a '|', so escape it rather than matching a regex alternation.
    assert.ok(
      text.includes(`geetest_seccode: ${GEETEST_SECCODE}`),
      `seccode line missing from:\n${text}`,
    );
    assert.doesNotMatch(text, /Raw answer/);
  } finally {
    await close();
  }
});

test('falls back to the raw answer when CapSkip returns an unparseable one', async () => {
  // The mock returns a plain token rather than a JSON payload for a "rawanswer"
  // pageurl, mirroring a CapSkip build that answers GeeTest with a bare string.
  // Both branches of the formatter must stay covered.
  const { client, close } = await startHarness();
  try {
    const result = await client.callTool({
      name: 'capskip_solve_geetest',
      arguments: {
        gt: 'gtvalue',
        challenge: 'challengevalue',
        url: 'https://rawanswer.example.com/login',
      },
    });
    assert.notStrictEqual(result.isError, true, result.content?.[0]?.text);
    assert.strictEqual(result.structuredContent.code, CODE);
    assert.strictEqual(result.structuredContent.challenge, undefined);
    assert.strictEqual(result.structuredContent.validate, undefined);
    assert.strictEqual(result.structuredContent.seccode, undefined);
    assert.match(result.content[0].text, new RegExp(`Raw answer: ${CODE}`));
  } finally {
    await close();
  }
});

test('api_server reaches in.php under that name', async () => {
  const { client, close, lastSubmit } = await startHarness();
  try {
    const result = await client.callTool({
      name: 'capskip_solve_geetest',
      arguments: {
        gt: 'gtvalue',
        challenge: 'challengevalue',
        url: 'https://example.com/login',
        api_server: 'api-na.geetest.com',
      },
    });
    assert.notStrictEqual(result.isError, true, result.content?.[0]?.text);

    const sent = lastSubmit();
    assert.strictEqual(sent.api_server, 'api-na.geetest.com');
    assert.strictEqual(sent.gt, 'gtvalue');
    assert.strictEqual(sent.challenge, 'challengevalue');
    assert.strictEqual(sent.method, 'geetest');
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
