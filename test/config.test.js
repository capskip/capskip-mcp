'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { resolveConfig, ConfigError } = require('../dist/config.js');

test('defaults match the CapSkip SDKs', () => {
  const cfg = resolveConfig([], {});
  assert.strictEqual(cfg.apiKey, 'capskip');
  assert.strictEqual(cfg.host, '127.0.0.1');
  assert.strictEqual(cfg.port, 8080);
  assert.strictEqual(cfg.defaultTimeout, 120);
  assert.strictEqual(cfg.recaptchaTimeout, 300);
  assert.strictEqual(cfg.pollingInterval, 5);
});

test('environment variables override defaults', () => {
  const cfg = resolveConfig([], {
    CAPSKIP_API_KEY: 'envkey',
    CAPSKIP_HOST: '10.0.0.5',
    CAPSKIP_PORT: '9090',
    CAPSKIP_TIMEOUT: '60',
    CAPSKIP_RECAPTCHA_TIMEOUT: '200',
    CAPSKIP_POLLING_INTERVAL: '2',
  });
  assert.strictEqual(cfg.apiKey, 'envkey');
  assert.strictEqual(cfg.host, '10.0.0.5');
  assert.strictEqual(cfg.port, 9090);
  assert.strictEqual(cfg.defaultTimeout, 60);
  assert.strictEqual(cfg.recaptchaTimeout, 200);
  assert.strictEqual(cfg.pollingInterval, 2);
});

test('CLI flags beat environment variables', () => {
  const cfg = resolveConfig(
    ['--host', '192.168.1.9', '--port', '7000', '--api-key', 'clikey'],
    { CAPSKIP_HOST: '10.0.0.5', CAPSKIP_PORT: '9090', CAPSKIP_API_KEY: 'envkey' },
  );
  assert.strictEqual(cfg.host, '192.168.1.9');
  assert.strictEqual(cfg.port, 7000);
  assert.strictEqual(cfg.apiKey, 'clikey');
});

test('--flag=value form is accepted', () => {
  const cfg = resolveConfig(['--port=7001'], {});
  assert.strictEqual(cfg.port, 7001);
});

test('non-numeric port is rejected by name', () => {
  assert.throws(
    () => resolveConfig([], { CAPSKIP_PORT: 'not-a-number' }),
    (err) => err instanceof ConfigError && /CAPSKIP_PORT/.test(err.message),
  );
});

test('out-of-range port is rejected', () => {
  assert.throws(() => resolveConfig(['--port', '70000'], {}), ConfigError);
  assert.throws(() => resolveConfig(['--port', '0'], {}), ConfigError);
});

test('negative timeout is rejected', () => {
  assert.throws(() => resolveConfig(['--timeout', '-5'], {}), ConfigError);
});

test('unknown flag is rejected by name', () => {
  assert.throws(
    () => resolveConfig(['--nope', 'x'], {}),
    (err) => err instanceof ConfigError && /--nope/.test(err.message),
  );
});
