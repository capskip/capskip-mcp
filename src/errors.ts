import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  ApiException,
  NetworkException,
  TimeoutException,
  ValidationException,
} from 'capskip';

export interface ErrorContext {
  host: string;
  port: number;
  captchaId?: string;
  elapsedSeconds?: number;
}

/** Build a tool result the model can read and act on. */
export function toolError(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

function messageOf(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

// CapSkip surfaces API failures as an error code inside the exception message.
const API_CODES: Array<[RegExp, (ctx: ErrorContext) => string]> = [
  [
    /ERROR_(KEY_DOES_NOT_EXIST|WRONG_USER_KEY)/,
    () =>
      'CapSkip rejected the API key. Set CAPSKIP_API_KEY to the key shown in '
      + 'CapSkip settings, or disable key validation there.',
  ],
  [
    /ERROR_CAPTCHA_UNSOLVABLE/,
    () =>
      'CapSkip could not solve this captcha. Fetch a fresh sitekey or challenge '
      + 'from the page and try again.',
  ],
  [
    /ERROR_GOOGLEKEY/,
    () => 'CapSkip rejected the sitekey. Re-read data-sitekey from the page and retry.',
  ],
  [
    /ERROR_PAGEURL/,
    () => 'CapSkip rejected the url. Pass the full page URL, including its scheme.',
  ],
  [
    /ERROR_INVALID_IMAGE/,
    () => 'CapSkip could not read that image. Check the file is a valid, uncorrupted PNG or JPEG.',
  ],
  [
    /ERROR_BAD_PARAMETERS/,
    () => 'CapSkip rejected the parameters for this captcha type. Re-check the values supplied.',
  ],
];

function unreachable(ctx: ErrorContext): string {
  return (
    `CapSkip is not reachable at ${ctx.host}:${ctx.port}. Confirm the CapSkip `
    + 'desktop app is running and that its API port matches this setting '
    + '(override with CAPSKIP_HOST / CAPSKIP_PORT).'
  );
}

/** Translate anything thrown during a solve into an actionable tool error. */
export function mapError(err: unknown, ctx: ErrorContext): CallToolResult {
  const message = messageOf(err);

  if (err instanceof TimeoutException) {
    const elapsed = ctx.elapsedSeconds !== undefined
      ? `${ctx.elapsedSeconds.toFixed(1)}s`
      : 'the configured timeout';
    const id = ctx.captchaId
      ? ` CapSkip captcha id ${ctx.captchaId} may still complete — it can be read later `
        + 'via res.php or any CapSkip SDK.'
      : '';
    return toolError(
      `The solve did not finish within ${elapsed}. Raise the timeout parameter, or `
      + `check CapSkip's own queue.${id}`,
    );
  }

  if (err instanceof ApiException) {
    for (const [pattern, build] of API_CODES) {
      if (pattern.test(message)) {
        return toolError(build(ctx));
      }
    }
    return toolError(`CapSkip returned an error: ${message}`);
  }

  if (err instanceof NetworkException) {
    return toolError(`${unreachable(ctx)} (underlying error: ${message})`);
  }

  if (err instanceof ValidationException) {
    return toolError(message);
  }

  // Connection failures can surface as plain Node errors before the SDK wraps them.
  if (/ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ETIMEDOUT|ENOTFOUND/.test(message)) {
    return toolError(`${unreachable(ctx)} (underlying error: ${message})`);
  }

  return toolError(`Unexpected failure while solving: ${message}`);
}
