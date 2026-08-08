import http from 'node:http';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { statusOutput } from '../schemas.js';
import type { ToolContext } from '../solver.js';

const PROBE_TIMEOUT_MS = 3000;

interface Probe {
  reachable: boolean;
  latencyMs?: number;
  error?: string;
}

function probe(host: string, port: number, apiKey: string): Promise<Probe> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const path = `/res.php?key=${encodeURIComponent(apiKey)}&action=get&id=0`;
    const req = http.request(
      { host, port, path, method: 'GET', timeout: PROBE_TIMEOUT_MS },
      (res) => {
        res.resume();
        res.on('end', () => resolve({ reachable: true, latencyMs: Date.now() - startedAt }));
      },
    );

    req.on('timeout', () => {
      req.destroy();
      resolve({ reachable: false, error: `no response within ${PROBE_TIMEOUT_MS}ms` });
    });
    req.on('error', (err: Error) => resolve({ reachable: false, error: err.message }));
    req.end();
  });
}

export function registerStatusTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'capskip_status',
    {
      title: 'Check CapSkip status',
      description:
        'Check whether the CapSkip desktop app is running and reachable. Call this '
        + 'first when a solve fails unexpectedly, to tell "CapSkip is not running" '
        + 'apart from "the sitekey was wrong". Takes no arguments.',
      inputSchema: z.strictObject({}),
      outputSchema: statusOutput,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () => {
      const { host, port, apiKey } = ctx.config;
      const result = await probe(host, port, apiKey);

      const detail = result.reachable
        ? `CapSkip answered at ${host}:${port} in ${result.latencyMs}ms.`
        : `No response from ${host}:${port} (${result.error}). Start the CapSkip `
          + 'desktop app, then confirm its API port matches — override with '
          + 'CAPSKIP_HOST / CAPSKIP_PORT.';

      const structured = {
        reachable: result.reachable,
        host,
        port,
        ...(result.latencyMs !== undefined ? { latencyMs: result.latencyMs } : {}),
        detail,
      };

      return {
        content: [{ type: 'text' as const, text: detail }],
        structuredContent: structured,
      };
    },
  );
}
