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
// Everything the sibling already modelled is load-bearing for existing tests
// and must stay: empty-body-means-not-ready, the never/slow/empty pageurl
// triggers, badkey rejection on in.php, and the Turnstile `useragent` field.

const http = require('http');
const { URL } = require('url');

const CODE = 'SOLVED_TOKEN_abc123';
const USER_AGENT = 'CapSkipUA/1.0';

// Real CapSkip answers a GeeTest solve with a JSON *string* in `request`, keyed
// with the geetest_ prefix the target site's own form fields use. The SDK's
// applyGeetestSolution parses exactly this shape into challenge/validate/seccode.
const GEETEST_CHALLENGE = '7cf6a8b1a2c34d5e6f7089abcdef0123';
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
