import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { mtCaptchaOutput, pageUrlSchema, proxySchema, timeoutSchema } from '../schemas.js';
import { runSolve } from '../solve.js';
import type { ToolContext } from '../solver.js';

const inputSchema = z.strictObject({
  sitekey: z
    .string()
    .min(1)
    .describe(
      "The MTCaptcha sitekey, which starts with 'MTPublic-' (for example "
      + "'MTPublic-KzqLY1cKH'). Read it from the sitekey of the mtcaptchaConfig object "
      + 'in the page source, or from the sitekey= parameter in the address of the '
      + 'widget iframe on service.mtcaptcha.com. Copy it exactly.',
    ),
  url: pageUrlSchema,
  action: z
    .string()
    .min(1)
    .optional()
    .describe(
      'The action value the page sets in its mtcaptchaConfig object, such as '
      + "'login'. Leave it out when the page sets none.",
    ),
  userAgent: z
    .string()
    .min(1)
    .optional()
    .describe('The User-Agent to present to MTCaptcha. Usually leave it out.'),
  proxy: proxySchema
    .optional()
    .describe(
      'Solve from this network. Every solve requests fresh challenges from '
      + "MTCaptcha's service, so many solves from one address are what its rate "
      + 'limits catch.',
    ),
  timeout: timeoutSchema,
});

export function registerMtCaptchaTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'capskip_solve_mtcaptcha',
    {
      title: 'Solve MTCaptcha',
      description:
        'Solve an MTCaptcha text captcha — a widget configured by a mtcaptchaConfig '
        + 'object, or an iframe from service.mtcaptcha.com — and get its token. '
        + "Requires sitekey (starts with 'MTPublic-') and url; pass action too when "
        + 'mtcaptchaConfig sets one. You do not need to read or type the characters '
        + 'in the picture. Put the returned token, which starts with v1(, in the '
        + "form's hidden mtcaptcha-verifiedtoken field, then submit the form.",
      inputSchema,
      outputSchema: mtCaptchaOutput,
      // Solving a captcha destroys nothing; see capy.ts for why the hint is explicit.
      // Not idempotent: each call mints a new token.
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async (args, extra) => {
      // No browser runs: CapSkip fetches the challenge and reads it itself, so the
      // tool keeps the default timeout like ALTCHA and Capy.
      const timeout = args.timeout ?? ctx.config.defaultTimeout;

      const options: Record<string, unknown> = {};
      if (args.action !== undefined) options.action = args.action;
      if (args.userAgent !== undefined) options.userAgent = args.userAgent;
      if (args.proxy !== undefined) options.proxy = args.proxy;

      return runSolve(
        ctx,
        extra,
        { label: 'Solving MTCaptcha', timeoutSeconds: timeout },
        (client) => client.mtcaptcha(args.sitekey, args.url, options as never),
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
              `Solved MTCaptcha in ${structured.solveSeconds}s.\n`
              + "Put this token in the form's hidden `mtcaptcha-verifiedtoken` field, "
              + 'then submit the form:\n'
              + `mtcaptcha-verifiedtoken: ${token}\n`
              + `(CapSkip captcha id ${structured.captchaId})`,
          };
        },
      );
    },
  );
}
