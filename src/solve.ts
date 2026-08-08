import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { CapSkip, SolveResult } from 'capskip';

import { mapError } from './errors.js';
import { startProgress } from './progress.js';
import type { ProgressNotification } from './progress.js';
import { createClient } from './solver.js';
import type { ToolContext } from './solver.js';

/**
 * The subset of the MCP request extra that a solve needs.
 *
 * `sendNotification` is typed against our own ProgressNotification rather than
 * `never` so the progress payload is checked at the one place it is built. The
 * `never` spelling silently accepted anything.
 */
export interface SolveExtra {
  _meta?: { progressToken?: string | number };
  sendNotification: (notification: ProgressNotification) => Promise<void>;
}

export interface SolveOptions {
  label: string;
  timeoutSeconds: number;
}

// The capskip SDK's normal()/recaptcha()/turnstile()/geetest() all resolve to
// this same interface, so aliasing it (rather than a hand-rolled
// Record<string, unknown>) lets every tool pass its client call straight
// through with no cast: a plain `interface` with no index signature is never
// structurally assignable to a Record<string, unknown>-shaped type in strict
// TypeScript, no matter how that type is spelled.
export type SolveResultLike = SolveResult;

export interface Formatted {
  text: string;
  structured: Record<string, unknown>;
}

/**
 * Run a solve with timing, progress reporting, and error translation.
 *
 * Every failure becomes an `isError` tool result — a solve tool must never
 * throw, or the model sees a protocol error it cannot reason about.
 */
export async function runSolve(
  ctx: ToolContext,
  extra: SolveExtra,
  opts: SolveOptions,
  fn: (client: CapSkip) => Promise<SolveResultLike>,
  format: (result: SolveResultLike, seconds: number) => Formatted,
): Promise<CallToolResult> {
  const startedAt = Date.now();
  const client = createClient(ctx.config, opts.timeoutSeconds);

  // The SDK's TimeoutException carries no captcha id, and solve() does not
  // catch it, so the id from send() would otherwise be lost exactly when it is
  // most useful. Recording it here is what lets a timeout error name it.
  // Safe because this client belongs to this call alone.
  let captchaId: string | undefined;
  const originalSend = client.send.bind(client);
  client.send = async (params?: Record<string, unknown>): Promise<string> => {
    const id = await originalSend(params);
    captchaId = id;
    return id;
  };

  const stop = startProgress({
    sendNotification: extra.sendNotification,
    progressToken: extra._meta?.progressToken,
    totalSeconds: opts.timeoutSeconds,
    label: opts.label,
  });

  try {
    const result = await fn(client);
    const seconds = (Date.now() - startedAt) / 1000;
    const { text, structured } = format(result, seconds);
    return {
      content: [{ type: 'text', text }],
      structuredContent: structured,
    };
  } catch (err) {
    return mapError(err, {
      host: ctx.config.host,
      port: ctx.config.port,
      elapsedSeconds: (Date.now() - startedAt) / 1000,
      captchaId,
    });
  } finally {
    stop();
  }
}
