import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { baseSolveOutput, pageUrlSchema, proxySchema, timeoutSchema } from '../schemas.js';
import { runSolve } from '../solve.js';
import type { ToolContext } from '../solver.js';

const inputSchema = z.strictObject({
  sitekey: z
    .string()
    .min(1)
    .describe("The site key, from the widget's data-sitekey attribute or the grecaptcha config."),
  url: pageUrlSchema,
  version: z
    .enum(['v2', 'v3'])
    .optional()
    .describe('Which reCAPTCHA generation the page uses. Defaults to v2.'),
  invisible: z
    .boolean()
    .optional()
    .describe('v2 only. True when the widget renders with size=invisible.'),
  enterprise: z
    .boolean()
    .optional()
    .describe('True for reCAPTCHA Enterprise. Works with both v2 and v3.'),
  action: z
    .string()
    .optional()
    .describe("v3 only. The action passed to grecaptcha.execute(), e.g. 'login'."),
  data_s: z
    .string()
    .optional()
    .describe("The data-s value, used by Google's own services. Rarely needed."),
  proxy: proxySchema
    .optional()
    .describe('Solve through this proxy so the token is issued against its IP.'),
  timeout: timeoutSchema,
});

export function registerRecaptchaTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'capskip_solve_recaptcha',
    {
      title: 'Solve reCAPTCHA',
      description:
        'Solve a Google reCAPTCHA v2 or v3 widget, including invisible and Enterprise '
        + 'variants. Returns a token to place in the page\'s "g-recaptcha-response" '
        + 'field before submitting the form. Read the sitekey from the page first — a '
        + 'guessed sitekey fails. Note that reCAPTCHA v3 returns a score assigned by '
        + 'Google; no solver can raise it.',
      inputSchema,
      outputSchema: baseSolveOutput,
      // destructiveHint defaults to *true* whenever readOnlyHint is false, so
      // omitting it advertised this tool as potentially destructive and cost it
      // auto-approval in clients that read the hint. Solving a captcha destroys
      // nothing. idempotentHint is deliberately left at its false default: each
      // call consumes a fresh, single-use challenge.
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async (args, extra) => {
      const timeout = args.timeout ?? ctx.config.recaptchaTimeout;
      const version = args.version ?? 'v2';

      // Forward only keys the caller actually set. The SDK validates by key
      // presence, not value, so an `action` key set to undefined would still be
      // rejected on a v2 submit. `invisible: false` and `enterprise: false` are
      // the defaults, so they are omitted rather than sent as 0 — sending
      // invisible:0 on a v3 request would trip the v3 unknown-key check.
      const options: Record<string, unknown> = { version };
      if (args.invisible === true) options.invisible = 1;
      if (args.enterprise === true) options.enterprise = 1;
      if (args.action !== undefined) options.action = args.action;
      if (args.data_s !== undefined) options.data_s = args.data_s;
      if (args.proxy !== undefined) options.proxy = args.proxy;

      return runSolve(
        ctx,
        extra,
        { label: `Solving reCAPTCHA ${version}`, timeoutSeconds: timeout },
        (client) => client.recaptcha(args.sitekey, args.url, options as never),
        (result, seconds) => {
          const structured = {
            captchaId: String(result.captchaId ?? ''),
            code: String(result.code ?? ''),
            solveSeconds: Number(seconds.toFixed(2)),
          };
          return {
            structured,
            text:
              `Solved reCAPTCHA ${version} in ${structured.solveSeconds}s.\n`
              + 'Put this token in the "g-recaptcha-response" field, then submit the form.\n'
              + `Token: ${structured.code}\n`
              + `(CapSkip captcha id ${structured.captchaId})`,
          };
        },
      );
    },
  );
}
