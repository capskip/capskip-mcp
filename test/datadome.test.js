'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { startHarness } = require('../test-helpers/harness.js');
const {
  DATADOME_COOKIE,
  DATADOME_BROWSER_USER_AGENT,
  DATADOME_LIST_PROXY,
} = require('../test-helpers/mockServer.js');

const TOOL = 'capskip_solve_datadome';
const URL = 'https://www.example.com/';
const CAPTCHA_URL = 'https://geo.captcha-delivery.com/captcha/?initialCid=AHrlqAAAAAMA7KBvCr0n4cEAG330MA%3D%3D'
  + '&hash=D013AA612AB2224D03B2318D0F5B19&cid=KzE6_pZBBTHdCdvZkauT9VAshi0wS7~v5_M_MacEtdw8'
  + '&t=fe&referer=https%3A%2F%2Fwww.example.com%2F&s=45225&e=549255a0289eaf17af60822309ab8db4&dm=cd';
const COOKIE_PAIR = DATADOME_COOKIE.split(';')[0];
const OWN_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/156.0.0.1 Safari/537.36';

async function call(args) {
  const harness = await startHarness();
  const result = await harness.client.callTool({ name: TOOL, arguments: args });
  return { ...harness, result };
}

test('submits the challenge and returns the cookie pair', async () => {
  const { result, lastSubmit, close } = await call({ captcha_url: CAPTCHA_URL, url: URL });
  try {
    assert.notStrictEqual(result.isError, true, result.content?.[0]?.text);
    assert.strictEqual(lastSubmit().method, 'datadome');
    // ~ % & and = all have to reach in.php intact.
    assert.strictEqual(lastSubmit().captcha_url, CAPTCHA_URL);
    assert.strictEqual(lastSubmit().pageurl, URL);
    assert.strictEqual(result.structuredContent.code, DATADOME_COOKIE);
    assert.strictEqual(result.structuredContent.cookie, COOKIE_PAIR);
  } finally {
    await close();
  }
});

test('reports the proxy CapSkip took from its own list when none was passed', async () => {
  // The catch: the cookie works only from the address that earned it. With no
  // proxy passed, CapSkip may solve through its DataDome list, and the agent has
  // to send the cookie through that same proxy.
  const { result, close } = await call({ captcha_url: CAPTCHA_URL, url: URL });
  try {
    assert.strictEqual(result.structuredContent.proxy, DATADOME_LIST_PROXY);
    assert.strictEqual(result.structuredContent.userAgent, DATADOME_BROWSER_USER_AGENT);
    const text = result.content[0].text;
    assert.ok(text.includes(`Cookie: ${COOKIE_PAIR}`), text);
    assert.ok(text.includes(`User-Agent: ${DATADOME_BROWSER_USER_AGENT}`), text);
    assert.ok(text.includes(DATADOME_LIST_PROXY), text);
    assert.match(text, /ONLY from that/);
  } finally {
    await close();
  }
});

test('forwards its own proxy and User-Agent, and then no proxy comes back', async () => {
  const { result, lastSubmit, close } = await call({
    captcha_url: CAPTCHA_URL,
    url: URL,
    userAgent: OWN_USER_AGENT,
    proxy: { type: 'HTTP', uri: 'login:secret@203.0.113.7:3128' },
  });
  try {
    assert.notStrictEqual(result.isError, true, result.content?.[0]?.text);
    assert.strictEqual(lastSubmit().proxy, 'login:secret@203.0.113.7:3128');
    assert.strictEqual(lastSubmit().proxytype, 'HTTP');
    assert.strictEqual(lastSubmit().useragent ?? lastSubmit().userAgent, OWN_USER_AGENT);
    assert.strictEqual(result.structuredContent.proxy, undefined);
    assert.strictEqual(result.structuredContent.userAgent, OWN_USER_AGENT);
    const text = result.content[0].text;
    assert.match(text, /same proxy you passed/);
    // The proxy's login never ends up in the reply.
    assert.ok(!text.includes('secret'), text);
  } finally {
    await close();
  }
});

test('refuses a banned block page (t=bv) before anything is submitted', async () => {
  const { result, lastSubmit, close } = await call({
    captcha_url: CAPTCHA_URL.replace('t=fe', 't=bv'), url: URL,
  });
  try {
    assert.strictEqual(result.isError, true);
    assert.match(result.content[0].text, /t=bv/);
    assert.strictEqual(lastSubmit() ?? undefined, undefined);
  } finally {
    await close();
  }
});

test('refuses a captcha_url that is not on captcha-delivery.com', async () => {
  const { result, lastSubmit, close } = await call({
    captcha_url: CAPTCHA_URL.replace('geo.captcha-delivery.com', 'evil.example.com'), url: URL,
  });
  try {
    assert.strictEqual(result.isError, true);
    assert.strictEqual(lastSubmit() ?? undefined, undefined);
  } finally {
    await close();
  }
});

test('refuses a User-Agent that is not Chrome for Windows', async () => {
  const { result, lastSubmit, close } = await call({
    captcha_url: CAPTCHA_URL,
    url: URL,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
      + '(KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36',
  });
  try {
    assert.strictEqual(result.isError, true);
    assert.strictEqual(lastSubmit() ?? undefined, undefined);
  } finally {
    await close();
  }
});

test('rejects an unknown argument', async () => {
  const { result, close } = await call({ captcha_url: CAPTCHA_URL, url: URL, sitekey: 'x' });
  try {
    assert.strictEqual(result.isError, true);
  } finally {
    await close();
  }
});
