import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
  friendlyCaptchaOutput, pageUrlSchema, proxySchema, timeoutSchema,
} from '../schemas.js';
import { runSolve } from '../solve.js';
import type { ToolContext } from '../solver.js';

const inputSchema = z.strictObject({
  sitekey: z
    .string()
    .min(1)
    .describe(
      "The data-sitekey attribute of the widget element — the one carrying "
      + "class='frc-captcha'.",
    ),
  url: pageUrlSchema,
  version: z
    .enum(['v1', 'v2'])
    .optional()
    .describe(
      'The protocol version the site uses. Two entirely different protocols '
      + 'ship under this one name and a sitekey does not say which, so send '
      + 'this or module_script. Defaults to v1 when neither is given.',
    ),
  module_script: z
    .string()
    .min(1)
    .optional()
    .describe(
      "The src of the widget script tag carrying type='module'. The most "
      + 'reliable version signal there is, because it is the build the site '
      + "actually loads: 'widget.module.min.js' means v1, 'site.min.js' v2.",
    ),
  nomodule_script: z
    .string()
    .min(1)
    .optional()
    .describe("The src of the widget script tag carrying 'nomodule'. Read for the same reason."),
  api_server: z
    .string()
    .min(1)
    .optional()
    .describe(
      "The data-residency tenant the sitekey belongs to: 'global' (the "
      + "default), 'eu', or a full URL. Both tenants mint a token for the same "
      + "sitekey, so the wrong one is only caught by the site's own check.",
    ),
  proxy: proxySchema
    .optional()
    .describe(
      'Solve from this network. Worth setting sooner here than almost anywhere '
      + 'else: the service raises the difficulty for addresses it has already '
      + 'seen a lot of.',
    ),
  timeout: timeoutSchema,
});

export function registerFriendlyCaptchaTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'capskip_solve_friendly_captcha',
    {
      title: 'Solve Friendly Captcha',
      description:
        'Solve a Friendly Captcha proof-of-work challenge. Nothing is shown on '
        + 'screen — the widget does arithmetic instead of asking the visitor to '
        + 'do anything. IMPORTANT: two entirely different protocols ship under '
        + 'this one name, sharing a brand and a sitekey namespace and nothing '
        + 'else, and a sitekey does not tell you which a site uses. Send version '
        + '(v1 or v2), or send module_script and let CapSkip read the version off '
        + 'the build the site loads. Solving the wrong one returns a well-formed '
        + 'token the site rejects, with nothing to indicate the version was the '
        + 'problem. The form field also differs by version: v1 uses '
        + "'frc-captcha-solution', v2 uses 'frc-captcha-response'. Solve time is "
        + 'not a constant — the service sets the difficulty per request — so '
        + 'budget for that rather than assuming a fixed duration.',
      inputSchema,
      outputSchema: friendlyCaptchaOutput,
      // destructiveHint defaults to *true* whenever readOnlyHint is false, so
      // omitting it would advertise this tool as potentially destructive and cost
      // it auto-approval in clients that read the hint. Solving a captcha
      // destroys nothing. idempotentHint is deliberately left at its false
      // default: each call mints a new token against fresh work.
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async (args, extra) => {
      // Proof-of-work, but not the millisecond kind ALTCHA does: the difficulty
      // is set per request, and v2 always solves in a browser. Both make solve
      // time variable enough to want the longer timeout.
      const timeout = args.timeout ?? ctx.config.recaptchaTimeout;

      const options: Record<string, unknown> = {};
      if (args.version !== undefined) options.version = args.version;
      if (args.module_script !== undefined) options.module_script = args.module_script;
      if (args.nomodule_script !== undefined) options.nomodule_script = args.nomodule_script;
      if (args.api_server !== undefined) options.api_server = args.api_server;
      if (args.proxy !== undefined) options.proxy = args.proxy;

      return runSolve(
        ctx,
        extra,
        { label: 'Solving Friendly Captcha', timeoutSeconds: timeout },
        (client) => client.friendlyCaptcha(args.sitekey, args.url, options as never),
        (result, seconds) => {
          const token = (result.token as string | undefined) ?? String(result.code ?? '');

          const structured = {
            captchaId: String(result.captchaId ?? ''),
            code: String(result.code ?? ''),
            solveSeconds: Number(seconds.toFixed(2)),
            token,
          };

          // The field the token goes into differs per version, and getting it
          // wrong is the single most common way a working v1 integration breaks
          // on a v2 site — so name the right one rather than leaving it implied.
          // A v2 token is a single opaque string beginning AQQA.; a v1 token is
          // four dot-separated parts. Fall back to the token's own shape when no
          // explicit version was sent.
          const isV2 = args.version === 'v2'
            || (args.version === undefined && token.startsWith('AQQA.'));
          const field = isV2 ? 'frc-captcha-response' : 'frc-captcha-solution';

          return {
            structured,
            text:
              `Solved Friendly Captcha in ${structured.solveSeconds}s.\n`
              + `Submit this verbatim in the form field named \`${field}\` `
              + `(${isV2 ? 'v2' : 'v1'}) — do not trim or re-encode it:\n`
              + `${field}: ${token}\n`
              + `(${token.length} characters; CapSkip captcha id ${structured.captchaId})`,
          };
        },
      );
    },
  );
}
