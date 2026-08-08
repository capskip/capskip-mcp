#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { ConfigError, resolveConfig } from './config.js';
import { createServer } from './server.js';

async function main(): Promise<void> {
  let config;
  try {
    config = resolveConfig(process.argv.slice(2), process.env);
  } catch (err) {
    if (err instanceof ConfigError) {
      process.stderr.write(`capskip-mcp: ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }

  const server = createServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // stdout carries protocol traffic only; anything else corrupts the stream.
  process.stderr.write(
    `capskip-mcp ready (CapSkip at ${config.host}:${config.port})\n`,
  );
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`capskip-mcp: fatal: ${message}\n`);
  process.exit(1);
});
