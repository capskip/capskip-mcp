import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { hCaptchaOutput, pageUrlSchema, proxySchema, timeoutSchema } from '../schemas.js';
import { runSolve } from '../solve.js';
import type { ToolContext } from '../solver.js';

const inputSchema = z.strictObject({
  sitekey: z
    .string()
    .min(1)
    .describe(
      'The sitekey of the hCaptcha widget, a UUID such as '
      + "'a5f74b19-9e45-40e0-b45d-47ff91b7a6c2'. Read it from data-sitekey on the "
      + 'widget container (<div class="h-captcha" data-sitekey="…">), from the '
      + 'sitekey option of hcaptcha.render(), or from the sitekey= parameter in the '
      + 'address of the hCaptcha iframe.',
    ),
  url: pageUrlSchema,
  invisible: z
    .boolean()
    .optional()
    .describe('true for an invisible widget, one rendered with data-size="invisible".'),
  data: z
    .string()
    .min(1)
    .optional()
    .describe(
      'hCaptcha Enterprise only: the rqdata value the page passes to the widget '
      + 'through hcaptcha.setData() before it runs. It is issued for one challenge '
      + 'and expires quickly, so read a fresh one for every solve. Leave it out '
      + 'when the page sets none.',
    ),
  userAgent: z
    .string()
    .min(1)
    .optional()
    .describe(
      'The User-Agent the form will be submitted with. CapSkip uses it only when it '
      + 'matches the browser it solves with, and always reports the one the token '
      + 'was actually earned with. Usually leave it out.',
    ),
  proxy: proxySchema
    .optional()
    .describe(
      'Solve from this network. hCaptcha scores the address a token comes from as '
      + 'well as the browser, so many solves from one address are what its rate '
      + 'limits catch. Pass the proxy the form submission will go through.',
    ),
  timeout: timeoutSchema,
});

export function registerHCaptchaTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'capskip_solve_hcaptcha',
    {
      title: 'Solve hCaptcha',
      description:
        'Solve an hCaptcha widget — <div class="h-captcha" data-sitekey="…"> or a '
        + 'js.hcaptcha.com script on the page — and get its token. Checkbox, '
        + 'invisible and hCaptcha Enterprise widgets all use this tool. Requires '
        + 'sitekey and url. Put the returned token in the form\'s hidden '
        + 'h-captcha-response field and in g-recaptcha-response if the form has one, '
        + 'or call the widget\'s data-callback with it, then submit with the returned '
        + 'User-Agent. Tokens are single use and expire about two minutes after '
        + 'they are issued, so submit promptly. Do not use capskip_solve_recaptcha '
        + 'for hCaptcha: both carry a data-sitekey, but they are different widgets.',
      inputSchema,
      outputSchema: hCaptchaOutput,
      // Solving a captcha destroys nothing; see capy.ts for why the hint is explicit.
      // Not idempotent: each call mints a new, single-use token.
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async (args, extra) => {
      // The widget is passed in a real browser, so it takes the browser timeout.
      const timeout = args.timeout ?? ctx.config.recaptchaTimeout;

      const options: Record<string, unknown> = {};
      if (args.invisible) options.invisible = 1;
      if (args.data !== undefined) options.data = args.data;
      if (args.userAgent !== undefined) options.userAgent = args.userAgent;
      if (args.proxy !== undefined) options.proxy = args.proxy;

      return runSolve(
        ctx,
        extra,
        { label: 'Solving hCaptcha', timeoutSeconds: timeout },
        (client) => client.hcaptcha(args.sitekey, args.url, options as never),
        (result, seconds) => {
          const token = (result.token as string | undefined) ?? String(result.code ?? '');
          const respKey = typeof result.respKey === 'string' ? result.respKey : '';
          const userAgent = result.userAgent as string | undefined;

          const structured = {
            captchaId: String(result.captchaId ?? ''),
            code: String(result.code ?? ''),
            solveSeconds: Number(seconds.toFixed(2)),
            token,
            respKey,
            ...(userAgent !== undefined ? { userAgent } : {}),
          };

          return {
            structured,
            text:
              `Solved hCaptcha in ${structured.solveSeconds}s.\n`
              + 'Put this token in the form\'s hidden `h-captcha-response` field, and in '
              + '`g-recaptcha-response` too if the form has one — or, if the widget '
              + 'was rendered with a data-callback, call that function with it:\n'
              + `h-captcha-response: ${token}\n`
              + (userAgent !== undefined
                ? `Submit the form with this User-Agent, the one the token was earned with: ${userAgent}\n`
                : '')
              + (respKey
                ? `respKey (only for a site that reads hcaptcha.getRespKey()): ${respKey}\n`
                : '')
              + 'The token is single use and expires about two minutes after it was '
              + `issued — submit promptly. (CapSkip captcha id ${structured.captchaId})`,
          };
        },
      );
    },
  );
}
