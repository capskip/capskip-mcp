'use strict';

// A local mock CapSkip server exercising the full submit/poll round trip over
// real HTTP, mirroring tests/conftest.py from the Python SDK.

const http = require('http');
const { URL } = require('url');

const CODE = 'SOLVED_TOKEN_abc123';
const USER_AGENT = 'CapSkipUA/1.0';

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

  return http.createServer((req, res) => {
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
  PNG,
  createMockServer,
  startMockServer,
};
