import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { captchaFoxOutput, pageUrlSchema, proxySchema, timeoutSchema } from '../schemas.js';
import { runSolve } from '../solve.js';
import type { ToolContext } from '../solver.js';

const inputSchema = z.strictObject({
  sitekey: z
    .string()
    .min(1)
    .describe(
      "The public key the widget renders with, conventionally prefixed 'sk_'. "
      + "Read it from data-sitekey on the widget container, from the "
      + 'captchafox.render(...) call, or — if the page builds the widget at '
      + 'runtime — from the path segment after /captcha/ in the request to '
      + 'api.captchafox.com.',
    ),
  url: pageUrlSchema,
  api_server: z
    .string()
    .min(1)
    .optional()
    .describe(
      'The widget entry point the target page loads. Defaults to '
      + "'https://cdn.captchafox.com/'. Send the MAM package path instead when "
      + 'the page loads that build — it returns a MAM_ prefixed token, and the '
      + 'two are not interchangeable.',
    ),
  proxy: proxySchema
    .optional()
    .describe(
      'Solve from this network. CaptchaFox scores the address a widget runs on '
      + 'as well as the browser, so repeated solves from one address drift '
      + 'toward interactive challenges and then refusals.',
    ),
  timeout: timeoutSchema,
});

export function registerCaptchaFoxTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'capskip_solve_captchafox',
    {
      title: 'Solve CaptchaFox',
      description:
        'Solve a CaptchaFox challenge. CaptchaFox scores the browser itself '
        + 'rather than asking the visitor to read anything, so most solves draw '
        + 'no puzzle at all. Returns a token to put in the form field named '
        + "'cf-captcha-response', verbatim — it is verified server side against "
        + 'the session that produced it, so any edit invalidates it. IMPORTANT: '
        + 'the url must be the page the widget actually runs on. CaptchaFox '
        + 'checks it against the domains the key is registered for and refuses a '
        + 'mismatch permanently, not intermittently — so a sitekey that fails '
        + 'immediately and consistently usually means the wrong page URL, not a '
        + 'bad key. The result also carries the User-Agent the token was minted '
        + 'under; submit under that one, not your own.',
      inputSchema,
      outputSchema: captchaFoxOutput,
      // destructiveHint defaults to *true* whenever readOnlyHint is false, so
      // omitting it would advertise this tool as potentially destructive and cost
      // it auto-approval in clients that read the hint. Solving a captcha
      // destroys nothing. idempotentHint is deliberately left at its false
      // default: each call mints a new, short-lived token.
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async (args, extra) => {
      // A real browser session, like reCAPTCHA and GeeTest, and longer again when
      // an interactive challenge is drawn — so it takes the browser timeout.
      const timeout = args.timeout ?? ctx.config.recaptchaTimeout;

      const options: Record<string, unknown> = {};
      if (args.api_server !== undefined) options.api_server = args.api_server;
      if (args.proxy !== undefined) options.proxy = args.proxy;

      return runSolve(
        ctx,
        extra,
        { label: 'Solving CaptchaFox', timeoutSeconds: timeout },
        (client) => client.captchafox(args.sitekey, args.url, options as never),
        (result, seconds) => {
          const token = (result.token as string | undefined) ?? String(result.code ?? '');
          const userAgent = result.userAgent as string | undefined;

          const structured = {
            captchaId: String(result.captchaId ?? ''),
            code: String(result.code ?? ''),
            solveSeconds: Number(seconds.toFixed(2)),
            token,
            ...(userAgent !== undefined ? { userAgent } : {}),
          };

          return {
            structured,
            text:
              `Solved CaptchaFox in ${structured.solveSeconds}s.\n`
              + 'Submit this verbatim in the form field the widget uses, named '
              + '`cf-captcha-response` — treat it as opaque, since it is '
              + 'verified against the session that produced it:\n'
              + `cf-captcha-response: ${token}\n`
              + (userAgent !== undefined
                ? `Submit it under this User-Agent, which is the one that minted `
                  + `it (not any you sent): ${userAgent}\n`
                : '')
              + `Tokens are short lived — submit promptly. (CapSkip captcha id ${structured.captchaId})`,
          };
        },
      );
    },
  );
}
