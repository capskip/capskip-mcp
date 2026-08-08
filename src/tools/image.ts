import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { baseSolveOutput, timeoutSchema } from '../schemas.js';
import { runSolve } from '../solve.js';
import type { SolveExtra } from '../solve.js';
import type { ToolContext } from '../solver.js';

const inputSchema = z.strictObject({
  image: z
    .string()
    .min(1)
    .describe(
      'The captcha image: a local file path, an http(s) URL, a data: URI, or a raw '
      + 'base64 string.',
    ),
  timeout: timeoutSchema,
});

export function registerImageTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'capskip_solve_image_captcha',
    {
      title: 'Solve an image captcha',
      description:
        'Read the text out of a distorted-text captcha image. Returns the recognized '
        + 'text, which you type into the page\'s captcha field. Proxies are not '
        + 'supported for image captchas.',
      inputSchema,
      outputSchema: baseSolveOutput,
      annotations: { readOnlyHint: false, openWorldHint: true },
    },
    async (args, extra) => {
      const timeout = args.timeout ?? ctx.config.defaultTimeout;

      return runSolve(
        ctx,
        extra as unknown as SolveExtra,
        { label: 'Solving image captcha', timeoutSeconds: timeout },
        // No options object: normal() rejects every option except `json`, so
        // passing { timeout } here would throw. runSolve applied the timeout to
        // the client instead.
        (client) => client.normal(args.image),
        (result, seconds) => {
          const structured = {
            captchaId: String(result.captchaId ?? ''),
            code: String(result.code ?? ''),
            solveSeconds: Number(seconds.toFixed(2)),
          };
          return {
            structured,
            text:
              `Solved the image captcha in ${structured.solveSeconds}s.\n`
              + `Text: ${structured.code}\n`
              + `(CapSkip captcha id ${structured.captchaId})`,
          };
        },
      );
    },
  );
}
