import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { pageUrlSchema, proxySchema, timeoutSchema, turnstileOutput } from '../schemas.js';
import { runSolve } from '../solve.js';
import type { SolveExtra } from '../solve.js';
import type { ToolContext } from '../solver.js';

const inputSchema = z.strictObject({
  sitekey: z
    .string()
    .min(1)
    .describe("The Turnstile site key, from the widget's data-sitekey attribute."),
  url: pageUrlSchema,
  action: z
    .string()
    .optional()
    .describe('The action from data-action or turnstile.render().'),
  cdata: z
    .string()
    .optional()
    .describe('The cData value. Interstitial challenge pages only, not ordinary widgets.'),
  pagedata: z
    .string()
    .optional()
    .describe('The chlPageData value. Interstitial challenge pages only.'),
  proxy: proxySchema
    .optional()
    .describe('Solve through this proxy so the token is issued against its IP.'),
  timeout: timeoutSchema,
});

export function registerTurnstileTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'capskip_solve_turnstile',
    {
      title: 'Solve Cloudflare Turnstile',
      description:
        'Solve a Cloudflare Turnstile widget or interstitial challenge page. Returns a '
        + 'token for the page\'s "cf-turnstile-response" field. IMPORTANT: submit the '
        + 'token using the returned userAgent — Cloudflare rejects a token replayed '
        + 'under a different User-Agent. For an interstitial challenge page, also pass '
        + 'cdata and pagedata read from the page.',
      inputSchema,
      outputSchema: turnstileOutput,
      annotations: { readOnlyHint: false, openWorldHint: true },
    },
    async (args, extra) => {
      const timeout = args.timeout ?? ctx.config.recaptchaTimeout;

      const options: Record<string, unknown> = {};
      if (args.action !== undefined) options.action = args.action;
      if (args.cdata !== undefined) options.data = args.cdata;
      if (args.pagedata !== undefined) options.pagedata = args.pagedata;
      if (args.proxy !== undefined) options.proxy = args.proxy;

      return runSolve(
        ctx,
        extra as unknown as SolveExtra,
        { label: 'Solving Turnstile', timeoutSeconds: timeout },
        (client) => client.turnstile(args.sitekey, args.url, options as never),
        (result, seconds) => {
          const userAgent = result.userAgent as string | undefined;
          const structured = {
            captchaId: String(result.captchaId ?? ''),
            code: String(result.code ?? ''),
            solveSeconds: Number(seconds.toFixed(2)),
            ...(userAgent ? { userAgent } : {}),
          };

          const uaLine = userAgent
            ? `\nSend the token with this exact User-Agent: ${userAgent}`
            : '';

          return {
            structured,
            text:
              `Solved Turnstile in ${structured.solveSeconds}s.\n`
              + 'Put this token in the "cf-turnstile-response" field, then submit the form.\n'
              + `Token: ${structured.code}${uaLine}\n`
              + `(CapSkip captcha id ${structured.captchaId})`,
          };
        },
      );
    },
  );
}
