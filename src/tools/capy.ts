import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { capyOutput, pageUrlSchema, proxySchema, timeoutSchema } from '../schemas.js';
import { runSolve } from '../solve.js';
import type { ToolContext } from '../solver.js';

const inputSchema = z.strictObject({
  sitekey: z
    .string()
    .min(1)
    .describe(
      "The site's public Capy key, conventionally prefixed 'PUZZLE_'. Read it "
      + "from 'capy_captchakey' in the page source, or from the widget script "
      + "URL: <script src='https://jp.api.capy.me/puzzle/get_js/?k=PUZZLE_XXXX'>.",
    ),
  url: pageUrlSchema,
  api_server: z
    .string()
    .min(1)
    .optional()
    .describe(
      'The root of the Capy API the key lives behind, taken from the widget '
      + "script URL. Defaults to 'https://jp.api.capy.me'. Note that "
      + "'api.capy.me' no longer resolves, although several solver services "
      + 'still document it.',
    ),
  proxy: proxySchema
    .optional()
    .describe(
      'Draw the puzzle image through this proxy. That fetch is the only request '
      + 'a Capy solve makes.',
    ),
  timeout: timeoutSchema,
});

export function registerCapyTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'capskip_solve_capy',
    {
      title: 'Solve Capy Puzzle',
      description:
        'Solve a Capy Puzzle captcha — a slide puzzle where a piece is dragged '
        + 'into a hole cut out of a photograph. IMPORTANT: unlike every other '
        + 'captcha tool here, the answer is NOT a single token. It is three '
        + 'values — captchakey, challengekey and answer — which all go into the '
        + "target form, in fields named 'capy_captchakey', 'capy_challengekey' "
        + "and 'capy_answer'. Submit the answer verbatim: it is the drag path "
        + 'the widget would have recorded, so trimming or re-encoding it '
        + 'invalidates the solve. The challenge key is single-use and '
        + 'short-lived, so submit promptly rather than caching the three values. '
        + 'A solve takes about two seconds — Capy refuses answers that arrive '
        + 'faster than a human could have produced them, so CapSkip holds the '
        + 'result back deliberately.',
      inputSchema,
      outputSchema: capyOutput,
      // destructiveHint defaults to *true* whenever readOnlyHint is false, so
      // omitting it would advertise this tool as potentially destructive and cost
      // it auto-approval in clients that read the hint. Solving a captcha
      // destroys nothing. idempotentHint is deliberately left at its false
      // default: each call draws a fresh puzzle bound to a new challenge key.
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async (args, extra) => {
      // Capy is one HTTP fetch plus pixel math, not a browser solve, so it takes
      // the default timeout rather than the longer browser one.
      const timeout = args.timeout ?? ctx.config.defaultTimeout;

      const options: Record<string, unknown> = {};
      if (args.api_server !== undefined) options.api_server = args.api_server;
      if (args.proxy !== undefined) options.proxy = args.proxy;

      return runSolve(
        ctx,
        extra,
        { label: 'Solving Capy Puzzle', timeoutSeconds: timeout },
        (client) => client.capy(args.sitekey, args.url, options as never),
        (result, seconds) => {
          const captchakey = result.captchakey as string | undefined;
          const challengekey = result.challengekey as string | undefined;
          const answer = result.answer as string | undefined;
          const respKey = result.respKey as string | undefined;

          const structured = {
            captchaId: String(result.captchaId ?? ''),
            // Capy's `code` is the raw answer object, which the Node SDK leaves
            // as-is. Stringify it so the declared string output holds the same
            // JSON a plain-text poll would have delivered.
            code: typeof result.code === 'string'
              ? result.code
              : JSON.stringify(result.code ?? ''),
            solveSeconds: Number(seconds.toFixed(2)),
            ...(captchakey !== undefined ? { captchakey } : {}),
            ...(challengekey !== undefined ? { challengekey } : {}),
            ...(answer !== undefined ? { answer } : {}),
            ...(respKey !== undefined ? { respKey } : {}),
          };

          return {
            structured,
            text:
              `Solved Capy Puzzle in ${structured.solveSeconds}s.\n`
              + 'This is NOT a token — put all three values in the form, '
              + 'verbatim, and submit promptly (the challenge key is '
              + 'single-use and short-lived):\n'
              + `capy_captchakey: ${captchakey ?? '(missing)'}\n`
              + `capy_challengekey: ${challengekey ?? '(missing)'}\n`
              + `capy_answer: ${answer ?? '(missing)'}\n`
              + `(CapSkip captcha id ${structured.captchaId})`,
          };
        },
      );
    },
  );
}
