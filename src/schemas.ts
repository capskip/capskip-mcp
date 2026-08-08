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

export const statusOutput = z.object({
  reachable: z.boolean(),
  host: z.string(),
  port: z.number(),
  latencyMs: z.number().optional(),
  detail: z.string(),
});
