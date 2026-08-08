import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { geetestOutput, pageUrlSchema, proxySchema, timeoutSchema } from '../schemas.js';
import { runSolve } from '../solve.js';
import type { SolveExtra } from '../solve.js';
import type { ToolContext } from '../solver.js';

const inputSchema = z.strictObject({
  gt: z
    .string()
    .min(1)
    .describe('The gt value. Static per site, so it can be reused.'),
  challenge: z
    .string()
    .min(1)
    .describe(
      'The challenge value. Single-use and expires in about a minute — fetch a fresh '
      + 'one immediately before calling this.',
    ),
  url: pageUrlSchema,
  api_server: z
    .string()
    .optional()
    .describe("A non-default GeeTest API domain, e.g. 'api-na.geetest.com'."),
  proxy: proxySchema
    .optional()
    .describe('Solve through this proxy so the answer is produced from its IP.'),
  timeout: timeoutSchema,
});

export function registerGeetestTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'capskip_solve_geetest',
    {
      title: 'Solve GeeTest v3',
      description:
        'Solve a GeeTest v3 slide-puzzle captcha. Returns geetest_challenge, '
        + 'geetest_validate, and geetest_seccode to post back exactly as the site\'s '
        + 'own front-end would. IMPORTANT: the challenge value is single-use and '
        + 'expires in roughly a minute, so fetch gt and challenge from the page '
        + 'immediately before calling. A stale challenge is the most common failure.',
      inputSchema,
      outputSchema: geetestOutput,
      annotations: { readOnlyHint: false, openWorldHint: true },
    },
    async (args, extra) => {
      const timeout = args.timeout ?? ctx.config.recaptchaTimeout;

      const options: Record<string, unknown> = {};
      if (args.api_server !== undefined) options.api_server = args.api_server;
      if (args.proxy !== undefined) options.proxy = args.proxy;

      return runSolve(
        ctx,
        extra as unknown as SolveExtra,
        { label: 'Solving GeeTest', timeoutSeconds: timeout },
        (client) => client.geetest(args.gt, args.challenge, args.url, options as never),
        (result, seconds) => {
          const challenge = result.challenge as string | undefined;
          const validate = result.validate as string | undefined;
          const seccode = result.seccode as string | undefined;

          const structured = {
            captchaId: String(result.captchaId ?? ''),
            code: String(result.code ?? ''),
            solveSeconds: Number(seconds.toFixed(2)),
            ...(challenge ? { challenge } : {}),
            ...(validate ? { validate } : {}),
            ...(seccode ? { seccode } : {}),
          };

          const fields = challenge || validate || seccode
            ? `geetest_challenge: ${challenge ?? '(none)'}\n`
              + `geetest_validate: ${validate ?? '(none)'}\n`
              + `geetest_seccode: ${seccode ?? '(none)'}\n`
            : `Raw answer: ${structured.code}\n`;

          return {
            structured,
            text:
              `Solved GeeTest in ${structured.solveSeconds}s.\n`
              + 'Post these back exactly as the site\'s own front-end would:\n'
              + fields
              + `(CapSkip captcha id ${structured.captchaId})`,
          };
        },
      );
    },
  );
}
