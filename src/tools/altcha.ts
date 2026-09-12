import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { altchaOutput, pageUrlSchema, proxySchema, timeoutSchema } from '../schemas.js';
import { runSolve } from '../solve.js';
import type { ToolContext } from '../solver.js';

const inputSchema = z.strictObject({
  url: pageUrlSchema,
  challenge_url: z
    .string()
    .min(1)
    .optional()
    .describe(
      'The endpoint the ALTCHA widget fetches its challenge from, e.g. '
      + "'https://site.com/altcha/challenge'. CapSkip fetches it for you. Pass "
      + 'this or challenge_json.',
    ),
  challenge_json: z
    .string()
    .min(1)
    .optional()
    .describe(
      'The challenge document itself, as a JSON string, when you already have '
      + 'it. Solved locally with no network request. Pass this or challenge_url.',
    ),
  proxy: proxySchema
    .optional()
    .describe(
      'Fetch the challenge through this proxy. Used ONLY for the challenge_url '
      + 'fetch — an inline challenge_json never touches the network.',
    ),
  timeout: timeoutSchema,
});

export function registerAltchaTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'capskip_solve_altcha',
    {
      title: 'Solve ALTCHA',
      description:
        'Solve an ALTCHA proof-of-work challenge. ALTCHA is not a recognition '
        + 'captcha — there is nothing to read; the client brute-forces a number '
        + 'that satisfies a challenge, so a solve is deterministic and takes '
        + 'milliseconds. Give it either challenge_url (the endpoint the '
        + '<altcha-widget> fetches from, which CapSkip will fetch) or '
        + 'challenge_json (the challenge document itself). Returns a token to put '
        + "in the page's form field named `altcha`, verbatim. IMPORTANT: "
        + 'challenges expire quickly — some sites inside two minutes — so read '
        + 'the challenge immediately before calling and submit the token '
        + 'promptly. An expired challenge is rejected with a bare "verification '
        + 'failed" that looks exactly like a wrong answer.',
      inputSchema,
      outputSchema: altchaOutput,
      // destructiveHint defaults to *true* whenever readOnlyHint is false, so
      // omitting it would advertise this tool as potentially destructive and cost
      // it auto-approval in clients that read the hint. Solving a captcha
      // destroys nothing. idempotentHint is deliberately left at its false
      // default: each call consumes a challenge that expires.
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async (args, extra) => {
      // CapSkip answers ERROR_BAD_PARAMETERS when neither is sent. zod cannot
      // express "at least one of" on a strictObject without reshaping the schema
      // into a union, which renders poorly in tool listings — so check here and
      // name what is missing.
      if (args.challenge_url === undefined && args.challenge_json === undefined) {
        return {
          isError: true,
          content: [{
            type: 'text' as const,
            text:
              'ALTCHA needs a challenge. Pass challenge_url (the endpoint the '
              + '<altcha-widget> fetches from — look in DevTools → Network for a '
              + 'request like /altcha/challenge) or challenge_json (that '
              + "endpoint's JSON response). Widget v1/v2 name it in a "
              + 'challengeurl="…" attribute; v3+ uses challenge="…" for both a '
              + 'URL and inline data.',
          }],
        };
      }

      const timeout = args.timeout ?? ctx.config.defaultTimeout;

      const options: Record<string, unknown> = {};
      if (args.challenge_url !== undefined) options.challenge_url = args.challenge_url;
      if (args.challenge_json !== undefined) options.challenge_json = args.challenge_json;
      if (args.proxy !== undefined) options.proxy = args.proxy;

      return runSolve(
        ctx,
        extra,
        { label: 'Solving ALTCHA', timeoutSeconds: timeout },
        (client) => client.altcha(args.url, options as never),
        (result, seconds) => {
          const token = (result.token as string | undefined) ?? String(result.code ?? '');
          const number = result.number as number | undefined;

          const structured = {
            captchaId: String(result.captchaId ?? ''),
            code: String(result.code ?? ''),
            solveSeconds: Number(seconds.toFixed(2)),
            token,
            ...(number !== undefined ? { number } : {}),
          };

          return {
            structured,
            text:
              `Solved ALTCHA in ${structured.solveSeconds}s.\n`
              + 'Submit this verbatim in the form field the widget uses, named '
              + '`altcha` — do not re-encode, trim or re-order it, or the '
              + "server's signature check fails:\n"
              + `altcha: ${token}\n`
              + (number !== undefined ? `(counter ${number}; ` : '(')
              + `CapSkip captcha id ${structured.captchaId})`,
          };
        },
      );
    },
  );
}
