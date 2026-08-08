'use strict';

// A local mock CapSkip server exercising the full submit/poll round trip over
// real HTTP, mirroring tests/conftest.py from the Python SDK.
//
// Started life as a verbatim copy of ../Node/test/helpers/mockServer.js and has
// since diverged deliberately, to model behaviour this server needs and the
// Node SDK's suite did not. Added here:
//   - a realistic GeeTest answer payload (`request` carrying a JSON string of
//     geetest_* fields), so the primary parse path is exercised rather than the
//     raw-answer fallback;
//   - `server.lastSubmit`, recording the exact field set that reached in.php, so
//     tests can assert on parameter mapping rather than only on "was accepted";
//   - `badkey` rejection on res.php as well as in.php, which real CapSkip does
//     and which capskip_status's probe depends on.
//   - a `rawanswer` pageurl trigger, keeping the raw-answer fallback covered
//     now that GeeTest solves return parseable JSON by default.
// Of what the sibling already modelled, tests in this repo actually exercise:
// the `never` pageurl trigger (a poll that never resolves, so a timeout is
// reached), `badkey` rejection on both in.php and res.php, the CAPCHA_NOT_READY
// text/JSON not-ready response, the Turnstile `useragent` field, and (added
// above) the GeeTest JSON payload and `server.lastSubmit`. The `slow` pageurl
// trigger and the `empty` one (the literal empty-body-means-not-ready
// response) are NOT referenced by any test here, and never were — they are
// kept only for parity with the sibling SDK's mock, in case a future test
// needs them. Removing them costs nothing either way, so they stay.

const http = require('http');
const { URL } = require('url');

const CODE = 'SOLVED_TOKEN_abc123';
const USER_AGENT = 'CapSkipUA/1.0';

// Real CapSkip answers a GeeTest solve with a JSON *string* in `request`, keyed
// with the geetest_ prefix the target site's own form fields use. The SDK's
// applyGeetestSolution parses exactly this shape into challenge/validate/seccode.
//
// GEETEST_CHALLENGE is deliberately NOT the challenge value the tests submit as
// a tool argument (see geetest.test.js) — it reads as "solved-payload", not as
// a plausible request challenge. That way, a test asserting
// structuredContent.challenge === GEETEST_CHALLENGE can only pass if the tool
// actually parsed this value out of the solved payload; a tool that echoed the
// request's own `challenge` argument back would fail it.
const GEETEST_CHALLENGE = 'solved-payload-challenge-fedcba9876543210';
const GEETEST_VALIDATE = 'd41d8cd98f00b204e9800998ecf8427e';
const GEETEST_SECCODE = 'd41d8cd98f00b204e9800998ecf8427e|jordan';
const GEETEST_ANSWER = JSON.stringify({
  geetest_challenge: GEETEST_CHALLENGE,
  geetest_validate: GEETEST_VALIDATE,
  geetest_seccode: GEETEST_SECCODE,
});

// A minimal valid 1x1 PNG. The mock returns these bytes for /image.png and the
// SDK never inspects the content, so exact pixels do not matter.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

function send(res, text, ctype = 'text/plain') {
  const body = Buffer.from(text, 'utf-8');
  res.writeHead(200, { 'Content-Type': ctype, 'Content-Length': body.length });
  res.end(body);
}

function createMockServer() {
  let ids = 0;
  const idType = {};
  const pollCount = {};

  const handleRes = (res, query) => {
    // Real CapSkip validates the key on res.php too, not only on in.php. The
    // status probe never submits anything, so this is the only way it can learn
    // the key is wrong.
    if (query.key === 'badkey') {
      send(res, 'ERROR_WRONG_USER_KEY');
      return;
    }

    const cid = query.id || '';
    const wantJson = String(query.json) === '1';
    pollCount[cid] = (pollCount[cid] || 0) + 1;

    // CapSkip returns an empty 200 body when no result is available yet
    // (briefly right after submit, for an unknown id, or once a solved token
    // has already been read). It must be treated as "not ready".
    if (cid.startsWith('empty') && pollCount[cid] < 3) {
      send(res, '');
      return;
    }

    const notReady = cid.startsWith('never')
      || (cid.startsWith('slow') && pollCount[cid] < 2);

    if (notReady) {
      send(
        res,
        wantJson ? '{"status":0,"request":"CAPCHA_NOT_READY"}' : 'CAPCHA_NOT_READY',
        wantJson ? 'application/json' : 'text/plain',
      );
    } else if (wantJson && idType[cid] === 'turnstile') {
      send(res, `{"status":1,"request":"${CODE}","useragent":"${USER_AGENT}"}`, 'application/json');
    } else if (wantJson && idType[cid] === 'geetest' && !cid.startsWith('raw')) {
      send(res, JSON.stringify({ status: 1, request: GEETEST_ANSWER }), 'application/json');
    } else if (wantJson) {
      send(res, `{"status":1,"request":"${CODE}"}`, 'application/json');
    } else {
      send(res, `OK|${CODE}`);
    }
  };

  const handleIn = (res, body, contentType) => {
    let fields;
    let key;
    if (contentType.startsWith('multipart/form-data')) {
      fields = { method: 'post' };
      key = 'capskip';
    } else {
      fields = Object.fromEntries(new URLSearchParams(body.toString('utf-8')));
      key = fields.key || 'capskip';
    }

    // Recorded before the badkey rejection so a test can inspect what was sent
    // even on a request the server refuses.
    server.lastSubmit = fields;

    if (key === 'badkey') {
      send(res, 'ERROR_WRONG_USER_KEY');
      return;
    }

    const pageurl = fields.pageurl || '';
    ids += 1;
    let cid;
    if (pageurl.includes('never')) {
      cid = `never${ids}`;
    } else if (pageurl.includes('slow')) {
      cid = `slow${ids}`;
    } else if (pageurl.includes('empty')) {
      cid = `empty${ids}`;
    } else if (pageurl.includes('rawanswer')) {
      cid = `raw${ids}`;
    } else {
      cid = String(ids);
    }
    idType[cid] = fields.method || '';
    // in.php returns JSON when the submit carried json=1, mirroring real CapSkip.
    if (String(fields.json) === '1') {
      send(res, `{"status":1,"request":"${cid}"}`, 'application/json');
    } else {
      send(res, `OK|${cid}`);
    }
  };

  const server = http.createServer((req, res) => {
    const parsed = new URL(req.url, 'http://localhost');

    if (req.method === 'GET' && parsed.pathname === '/image.png') {
      res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': PNG.length });
      res.end(PNG);
      return;
    }

    if (req.method === 'GET' && parsed.pathname === '/res.php') {
      handleRes(res, Object.fromEntries(parsed.searchParams.entries()));
      return;
    }

    if (req.method === 'POST' && parsed.pathname === '/in.php') {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => handleIn(res, Buffer.concat(chunks), req.headers['content-type'] || ''));
      return;
    }

    send(res, 'ERROR_NOT_FOUND');
  });

  /** The field set of the most recent in.php submit, or null if none yet. */
  server.lastSubmit = null;

  return server;
}

/** Start the mock server on a random loopback port. */
function startMockServer() {
  const server = createMockServer();
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { address, port } = server.address();
      resolve({ server, host: address, port });
    });
  });
}

module.exports = {
  CODE,
  USER_AGENT,
  GEETEST_CHALLENGE,
  GEETEST_VALIDATE,
  GEETEST_SECCODE,
  GEETEST_ANSWER,
  PNG,
  createMockServer,
  startMockServer,
};
