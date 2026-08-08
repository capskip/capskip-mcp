import { CapSkip } from 'capskip';

import type { CapSkipConfig } from './config.js';

/** Shared state handed to every tool registration. */
export interface ToolContext {
  config: CapSkipConfig;
}

export function createContext(config: CapSkipConfig): ToolContext {
  return { config };
}

/**
 * Build a CapSkip client for a single solve.
 *
 * Per-call rather than per-process for two reasons. `runSolve` wraps this
 * client's `send` to capture the captcha id, which a shared client could not do
 * safely under concurrent tool calls. And `normal()` rejects every option except
 * `json`, so the caller's timeout cannot be passed as an argument — setting it
 * on the client is what makes one `timeout` parameter work for all four captcha
 * types.
 *
 * The constructor performs no I/O, so this is cheap.
 */
export function createClient(config: CapSkipConfig, timeoutSeconds: number): CapSkip {
  return new CapSkip({
    apiKey: config.apiKey,
    host: config.host,
    port: config.port,
    defaultTimeout: timeoutSeconds,
    recaptchaTimeout: timeoutSeconds,
    pollingInterval: config.pollingInterval,
  });
}
