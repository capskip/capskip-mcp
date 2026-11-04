import { z } from 'zod';

/**
 * CapSkip maps only these four proxy schemes and answers ERROR_BAD_PARAMETERS
 * for anything else, SOCKS4 included.
 */
export const proxySchema = z.object({
  type: z
    .enum(['HTTP', 'HTTPS', 'SOCKS5', 'SOCKS5H'])
    .describe('Proxy scheme. CapSkip supports only these four.'),
  uri: z
    .string()
    .min(1)
    .describe('Proxy address as `host:port` or `login:password@host:port`.'),
});

export type ProxyInput = z.infer<typeof proxySchema>;

/**
 * Bounded at 600s. A larger value is rejected rather than clamped so the caller
 * learns the limit instead of silently getting a shorter wait.
 */
export const timeoutSchema = z
  .number()
  .int()
  .min(1)
  .max(600)
  .optional()
  .describe('Seconds to wait before giving up. Maximum 600.');

export const pageUrlSchema = z
  .url()
  .describe('Full URL of the page the captcha appears on, including scheme.');

export const baseSolveOutput = z.object({
  captchaId: z.string(),
  code: z.string(),
  solveSeconds: z.number(),
});

export const turnstileOutput = baseSolveOutput.extend({
  userAgent: z.string().optional(),
});

export const geetestOutput = baseSolveOutput.extend({
  challenge: z.string().optional(),
  validate: z.string().optional(),
  seccode: z.string().optional(),
});

export const altchaOutput = baseSolveOutput.extend({
  /** The base64 payload to submit in the site's `altcha` form field, verbatim. */
  token: z.string(),
  /** The counter that satisfied the challenge. Absent if the payload did not decode. */
  number: z.number().optional(),
});

export const capyOutput = baseSolveOutput.extend({
  /** The value for the target form's `capy_captchakey` field. */
  captchakey: z.string().optional(),
  /** The value for the target form's `capy_challengekey` field. Single-use. */
  challengekey: z.string().optional(),
  /** The value for the target form's `capy_answer` field — the drag path, verbatim. */
  answer: z.string().optional(),
  /** Empty for a puzzle solve; present only for shape compatibility. */
  respKey: z.string().optional(),
});

export const captchaFoxOutput = baseSolveOutput.extend({
  /** The token to submit in the site's `cf-captcha-response` field, verbatim. */
  token: z.string(),
  /**
   * The User-Agent the token was minted under — the browser's own, not one the
   * caller sent. Absent when the solve captured none rather than guessed.
   */
  userAgent: z.string().optional(),
});

export const friendlyCaptchaOutput = baseSolveOutput.extend({
  /**
   * The token to submit verbatim — in `frc-captcha-solution` on v1, or
   * `frc-captcha-response` on v2. The field names differ between versions.
   */
  token: z.string(),
});

export const amazonWafOutput = baseSolveOutput.extend({
  /** AWS WAF's proof the puzzle was answered. Only works paired with existing_token. */
  captcha_voucher: z.string().optional(),
  /** The token the voucher was issued for. POST both to the `voucher` endpoint. */
  existing_token: z.string().optional(),
});

export const dataDomeOutput = baseSolveOutput.extend({
  /** The `datadome=...` pair alone, for a Cookie header. `code` keeps the attributes. */
  cookie: z.string(),
  /** The User-Agent the cookie was earned with. Send it with every request carrying the cookie. */
  userAgent: z.string().optional(),
  /**
   * Present only when no proxy was passed and CapSkip solved through its own
   * DataDome proxy list: that proxy as host:port. The cookie works only through it.
   */
  proxy: z.string().optional(),
});

export const hCaptchaOutput = baseSolveOutput.extend({
  /** The token for the form's `h-captcha-response` (and `g-recaptcha-response`) field. */
  token: z.string(),
  /** The second value hCaptcha hands the widget. Most sites never read it; it can be empty. */
  respKey: z.string(),
  /** The User-Agent the token was earned with. Submit the form with it. */
  userAgent: z.string().optional(),
});

export const statusOutput = z.object({
  reachable: z.boolean(),
  host: z.string(),
  port: z.number(),
  latencyMs: z.number().optional(),
  detail: z.string(),
});
