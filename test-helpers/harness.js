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

  return { client, close, mock };
}

module.exports = { startHarness };
