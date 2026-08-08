'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { mapError, toolError } = require('../dist/errors.js');
const {
  ValidationException, NetworkException, ApiException, TimeoutException,
} = require('capskip');

const CTX = { host: '127.0.0.1', port: 8080 };

function textOf(result) {
  return result.content[0].text;
}

test('toolError marks the result as an error', () => {
  const result = toolError('boom');
  assert.strictEqual(result.isError, true);
  assert.strictEqual(textOf(result), 'boom');
});

test('connection refused explains that CapSkip may not be running', () => {
  const err = new NetworkException('connect ECONNREFUSED 127.0.0.1:8080');
  const text = textOf(mapError(err, CTX));
  assert.match(text, /not reachable at 127\.0\.0\.1:8080/);
  assert.match(text, /desktop app is running/);
});

test('a rejected API key points at CAPSKIP_API_KEY', () => {
  const err = new ApiException('ERROR_KEY_DOES_NOT_EXIST');
  const text = textOf(mapError(err, CTX));
  assert.match(text, /rejected the API key/);
  assert.match(text, /CAPSKIP_API_KEY/);
});

test('ERROR_WRONG_USER_KEY maps to the same key guidance', () => {
  const text = textOf(mapError(new ApiException('ERROR_WRONG_USER_KEY'), CTX));
  assert.match(text, /CAPSKIP_API_KEY/);
});

test('unsolvable captcha suggests a fresh challenge', () => {
  const text = textOf(mapError(new ApiException('ERROR_CAPTCHA_UNSOLVABLE'), CTX));
  assert.match(text, /could not solve/i);
  assert.match(text, /fresh/i);
});

test('ERROR_GOOGLEKEY names the offending parameter', () => {
  const text = textOf(mapError(new ApiException('ERROR_GOOGLEKEY'), CTX));
  assert.match(text, /sitekey/);
});

test('ERROR_PAGEURL names the offending parameter', () => {
  const text = textOf(mapError(new ApiException('ERROR_PAGEURL'), CTX));
  assert.match(text, /url/);
});

test('validation errors are surfaced verbatim', () => {
  const text = textOf(mapError(new ValidationException("'action' is only supported for reCAPTCHA v3."), CTX));
  assert.match(text, /only supported for reCAPTCHA v3/);
});

test('timeout reports elapsed seconds and the captcha id', () => {
  const err = new TimeoutException('timeout 300 exceeded');
  const text = textOf(mapError(err, { ...CTX, captchaId: '9912', elapsedSeconds: 301.4 }));
  assert.match(text, /301/);
  assert.match(text, /9912/);
});

test('unknown throwables still produce an error result, not a throw', () => {
  const result = mapError(new Error('something odd'), CTX);
  assert.strictEqual(result.isError, true);
  assert.match(textOf(result), /something odd/);
});

test('non-Error throwables are handled', () => {
  const result = mapError('a bare string', CTX);
  assert.strictEqual(result.isError, true);
  assert.match(textOf(result), /a bare string/);
});
