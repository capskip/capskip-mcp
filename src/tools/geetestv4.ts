import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { geetestV4Output, pageUrlSchema, proxySchema, timeoutSchema } from '../schemas.js';
import { runSolve } from '../solve.js';
import type { ToolContext } from '../solver.js';

const inputSchema = z.strictObject({
  captcha_id: z
    .string()
    .trim()
    .min(1)
    .describe(
      'The GeeTest v4 captcha_id: 32 hex characters, the same for every visitor. '
      + 'The page loads static.geetest.com/v4/gt4.js and passes it to initGeetest4 as '
      + 'captchaId; if the call is built at runtime, it is the captcha_id parameter '
      + 'of the request to gcaptcha4.geetest.com/load.',
    ),
  url: pageUrlSchema,
  risk_type: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe(
      "Challenge type to ask GeeTest for: 'slide', 'icon', 'nine', 'word', 'phrase', "
      + "'match', 'winlinze', 'svg_seed', 'svg_icon' or 'ai'. GeeTest applies it only "
      + "where the site allows it. Usually leave it out: the site's own choice wins "
      + 'and every type is solved.',
    ),
  proxy: proxySchema
    .optional()
    .describe('Solve through this proxy so the answer is produced from its IP.'),
  timeout: timeoutSchema,
});

const FIELDS = ['captcha_id', 'lot_number', 'pass_token', 'gen_time', 'captcha_output'] as const;

export function registerGeetestV4Tool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'capskip_solve_geetest_v4',
    {
      title: 'Solve GeeTest v4',
      description:
        'Solve a GeeTest v4 captcha (a page loading static.geetest.com/v4/gt4.js and '
        + 'calling initGeetest4) and get the five values the site verifies: '
        + 'captcha_id, lot_number, pass_token, gen_time and captcha_output. Requires '
        + 'captcha_id and url only; unlike GeeTest v3 there is no challenge to fetch '
        + 'first. Every v4 challenge type is answered (slide, icon, nine-grid, match '
        + 'and the rest). Send the five values under those same names in the request '
        + "the page's own submit makes. For GeeTest v3 (gt + challenge) use "
        + 'capskip_solve_geetest instead.',
      inputSchema,
      outputSchema: geetestV4Output,
      // Solving a captcha destroys nothing; see capy.ts for why the hint is explicit.
      // Not idempotent: each call produces a new, single-use set of values.
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async (args, extra) => {
      // A real browser solve, like v3, so it takes the longer timeout.
      const timeout = args.timeout ?? ctx.config.recaptchaTimeout;

      const options: Record<string, unknown> = {};
      if (args.risk_type !== undefined) options.risk_type = args.risk_type;
      if (args.proxy !== undefined) options.proxy = args.proxy;

      return runSolve(
        ctx,
        extra,
        { label: 'Solving GeeTest v4', timeoutSeconds: timeout },
        (client) => client.geetestV4(args.captcha_id, args.url, options as never),
        (result, seconds) => {
          const values: Partial<Record<(typeof FIELDS)[number], string>> = {};
          for (const field of FIELDS) {
            const value = result[field];
            if (value !== undefined && value !== null && value !== '') values[field] = String(value);
          }
          const isOffline = result.isOffline === true;

          const structured = {
            captchaId: String(result.captchaId ?? ''),
            code: String(result.code ?? ''),
            solveSeconds: Number(seconds.toFixed(2)),
            ...values,
            ...(isOffline ? { isOffline: true } : {}),
          };

          const lines = Object.keys(values).length > 0
            ? FIELDS.map((f) => `${f}: ${values[f] ?? '(none)'}\n`).join('')
            : `Raw answer: ${structured.code}\n`;

          return {
            structured,
            text:
              `Solved GeeTest v4 in ${structured.solveSeconds}s.\n`
              + "Send these five values, unchanged and under these names, in the page's own "
              + 'submit request:\n'
              + lines
              + (isOffline
                ? 'GeeTest could not be reached and passed the widget in offline mode '
                  + '(isOffline: true); the site decides whether to accept that.\n'
                : '')
              + `(CapSkip captcha id ${structured.captchaId})`,
          };
        },
      );
    },
  );
}
