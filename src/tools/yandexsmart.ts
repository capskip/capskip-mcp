import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { pageUrlSchema, proxySchema, timeoutSchema, yandexSmartOutput } from '../schemas.js';
import { runSolve } from '../solve.js';
import type { ToolContext } from '../solver.js';

const inputSchema = z.strictObject({
  sitekey: z
    .string()
    .min(1)
    .describe(
      "The SmartCaptcha sitekey, usually starting with 'ysc1_'. Read it from the "
      + 'data-sitekey of the <div class="smart-captcha"> container, from the sitekey '
      + 'the page passes to window.smartCaptcha.render, or from the sitekey= parameter '
      + 'in the address of the widget iframe on smartcaptcha.yandexcloud.net. Copy it '
      + 'exactly.',
    ),
  url: pageUrlSchema,
  userAgent: z
    .string()
    .min(1)
    .optional()
    .describe('The User-Agent to present to Yandex. Usually leave it out.'),
  proxy: proxySchema
    .optional()
    .describe(
      'Solve from this network. Yandex scores the network every check comes from, so '
      + 'many solves from one address are what makes it ask for harder challenges.',
    ),
  timeout: timeoutSchema,
});

export function registerYandexSmartTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'capskip_solve_yandex_smart',
    {
      title: 'Solve Yandex SmartCaptcha',
      description:
        'Solve a Yandex SmartCaptcha (a widget loaded from smartcaptcha.yandexcloud.net, '
        + 'usually a <div class="smart-captcha" data-sitekey="ysc1_...">) and get its '
        + 'token. Requires sitekey and url. You do not need to tick the checkbox or '
        + 'answer the challenges it shows; CapSkip returns only the finished token. Put '
        + "the token in the form's hidden smart-token field, then submit the form. A "
        + 'token is valid for five minutes and can be checked once.',
      inputSchema,
      outputSchema: yandexSmartOutput,
      // Solving a captcha destroys nothing; see capy.ts for why the hint is explicit.
      // Not idempotent: each call mints a new token.
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async (args, extra) => {
      // The widget runs in a real browser, so the tool takes the longer timeout.
      const timeout = args.timeout ?? ctx.config.recaptchaTimeout;

      const options: Record<string, unknown> = {};
      if (args.userAgent !== undefined) options.userAgent = args.userAgent;
      if (args.proxy !== undefined) options.proxy = args.proxy;

      return runSolve(
        ctx,
        extra,
        { label: 'Solving Yandex SmartCaptcha', timeoutSeconds: timeout },
        (client) => client.yandexSmart(args.sitekey, args.url, options as never),
        (result, seconds) => {
          const token = (result.token as string | undefined) ?? String(result.code ?? '');

          const structured = {
            captchaId: String(result.captchaId ?? ''),
            code: String(result.code ?? ''),
            solveSeconds: Number(seconds.toFixed(2)),
            token,
          };

          return {
            structured,
            text:
              `Solved Yandex SmartCaptcha in ${structured.solveSeconds}s.\n`
              + "Put this token in the form's hidden `smart-token` field, then submit the "
              + 'form within five minutes:\n'
              + `smart-token: ${token}\n`
              + `(CapSkip captcha id ${structured.captchaId})`,
          };
        },
      );
    },
  );
}
