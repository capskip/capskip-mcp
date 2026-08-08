import http from 'node:http';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { statusOutput } from '../schemas.js';
import type { ToolContext } from '../solver.js';

const PROBE_TIMEOUT_MS = 3000;

// A CapSkip res.php reply is a few dozen bytes. Anything else on this port could
// stream indefinitely, so stop accumulating well before that becomes a problem.
const MAX_BODY_BYTES = 4096;

const KEY_REJECTED = /ERROR_(WRONG_USER_KEY|KEY_DOES_NOT_EXIST)/;

/**
 * What the probe found. `reachable` alone is not enough: port 8080 is commonly
 * occupied, and a decoy that answers 404 to everything would otherwise be
 * reported as a healthy CapSkip moments before a solve fails against it.
 */
type ProbeOutcome =
  /** CapSkip answered normally. */
  | 'ok'
  /** CapSkip answered, but rejected the API key. It is running; the key is wrong. */
  | 'key-rejected'
  /** Something answered on this port, but not as CapSkip. */
  | 'not-capskip'
  /** Nothing answered at all. */
  | 'no-response';

interface Probe {
  outcome: ProbeOutcome;
  latencyMs?: number;
  statusCode?: number;
  error?: string;
}

function classify(statusCode: number | undefined, body: string): ProbeOutcome {
  if (statusCode !== 200) {
    return 'not-capskip';
  }
  return KEY_REJECTED.test(body) ? 'key-rejected' : 'ok';
}

function probe(host: string, port: number, apiKey: string): Promise<Probe> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const path = `/res.php?key=${encodeURIComponent(apiKey)}&action=get&id=0`;
    const req = http.request(
      { host, port, path, method: 'GET', timeout: PROBE_TIMEOUT_MS },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          if (size < MAX_BODY_BYTES) {
            chunks.push(chunk);
            size += chunk.length;
          }
        });
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf-8');
          resolve({
            outcome: classify(res.statusCode, body),
            latencyMs: Date.now() - startedAt,
            statusCode: res.statusCode,
          });
        });
      },
    );

    req.on('timeout', () => {
      req.destroy();
      resolve({ outcome: 'no-response', error: `no response within ${PROBE_TIMEOUT_MS}ms` });
    });
    req.on('error', (err: Error) => resolve({ outcome: 'no-response', error: err.message }));
    req.end();
  });
}

function describe(result: Probe, host: string, port: number): string {
  switch (result.outcome) {
    case 'ok':
      return `CapSkip answered at ${host}:${port} in ${result.latencyMs}ms.`;
    case 'key-rejected':
      return (
        `CapSkip is running at ${host}:${port}, but it rejected the API key. Set `
        + 'CAPSKIP_API_KEY to the key shown in CapSkip settings, or disable key '
        + 'validation there. Solves will fail until this is fixed.'
      );
    case 'not-capskip':
      return (
        `Something is listening on ${host}:${port} but it did not answer as CapSkip `
        + `(HTTP ${result.statusCode}). Check the API port in CapSkip settings, and `
        + 'that nothing else has taken that port — override with CAPSKIP_HOST / '
        + 'CAPSKIP_PORT.'
      );
    default:
      return (
        `No response from ${host}:${port} (${result.error}). Start the CapSkip `
        + 'desktop app, then confirm its API port matches — override with '
        + 'CAPSKIP_HOST / CAPSKIP_PORT.'
      );
  }
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

      // A rejected key still means CapSkip is there — the model should fix the
      // key, not go looking for a process that is already running.
      const reachable = result.outcome === 'ok' || result.outcome === 'key-rejected';
      const detail = describe(result, host, port);

      const structured = {
        reachable,
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
