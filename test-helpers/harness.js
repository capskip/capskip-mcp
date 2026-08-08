'use strict';

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js');

const { createServer } = require('../dist/server.js');
const { startMockServer } = require('./mockServer.js');

/**
 * Boot a mock CapSkip, point a real MCP server at it, and link an in-memory
 * client. Exercises the full path — schema validation, the capskip SDK, HTTP —
 * without CapSkip installed.
 */
async function startHarness(overrides = {}) {
  const mock = await startMockServer();

  const server = createServer({
    apiKey: 'capskip',
    host: mock.host,
    port: mock.port,
    defaultTimeout: 10,
    recaptchaTimeout: 10,
    pollingInterval: 1,
    ...overrides,
  });

  const client = new Client({ name: 'capskip-mcp-test', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  const close = async () => {
    await client.close();
    await server.close();
    await new Promise((resolve) => mock.server.close(resolve));
  };

  /**
   * The field set of the last submit that reached the mock's in.php — i.e. what
   * the CapSkip API would actually have received. Read it after a tool call to
   * assert on parameter mapping, not merely on "the call was not rejected".
   * A function rather than a value because it changes with every call.
   */
  const lastSubmit = () => mock.server.lastSubmit;

  return { client, close, mock, lastSubmit };
}

module.exports = { startHarness };
