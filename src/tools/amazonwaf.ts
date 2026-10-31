import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { amazonWafOutput, pageUrlSchema, proxySchema, timeoutSchema } from '../schemas.js';
import { runSolve } from '../solve.js';
import type { ToolContext } from '../solver.js';

const scriptUrl = (what: string) =>
  z
    .url()
    .optional()
    .describe(
      `The full https URL of the page's ${what}, exactly as it appears in the `
      + "script tag's src. It must be on an awswaf.com host: CapSkip refuses any "
      + 'other script, because it is not an AWS WAF integration.',
    );

const inputSchema = z.strictObject({
  sitekey: z
    .string()
    .min(1)
    .describe(
      "On a challenge page (the HTTP 405 page carrying window.gokuProps), the "
      + "gokuProps.key value — a long key usually starting 'AQIDAH'. On a widget "
      + 'page (AwsWafCaptcha.renderCaptcha), the apiKey passed to renderCaptcha — '
      + "a long key ending in a short suffix such as '_0_1'.",
    ),
  url: pageUrlSchema,
  iv: z
    .string()
    .min(1)
    .optional()
    .describe(
      'gokuProps.iv from a challenge page. Send it together with context, or '
      + 'leave both out and CapSkip reads them from the page at solve time — the '
      + 'safer choice when your copy of the page is more than a few minutes old. '
      + 'Never send it for a widget page.',
    ),
  context: z
    .string()
    .min(1)
    .optional()
    .describe(
      'gokuProps.context from a challenge page. Send it together with iv, or '
      + 'leave both out.',
    ),
  challenge_script: scriptUrl('challenge.js'),
  captcha_script: scriptUrl('captcha.js'),
  jsapiScript: scriptUrl('jsapi.js (widget pages only — sending it without iv/context is what marks the solve as a widget)'),
  proxy: proxySchema
    .optional()
    .describe(
      'Solve through this proxy. Sites behind AWS WAF usually pair the CAPTCHA '
      + 'with rate limits and IP reputation rules, so use one when solving at volume.',
    ),
  timeout: timeoutSchema,
});

/** The folder a challenge.js lives in, plus `voucher`: where the pair is exchanged. */
function voucherUrl(challengeScript: string | undefined): string | undefined {
  if (!challengeScript) return undefined;
  const cut = challengeScript.split(/[?#]/)[0];
  if (!cut.endsWith('/challenge.js')) return undefined;
  return `${cut.slice(0, -'challenge.js'.length)}voucher`;
}

export function registerAmazonWafTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'capskip_solve_amazon_waf',
    {
      title: 'Solve AWS WAF CAPTCHA',
      description:
        'Solve an AWS WAF (Amazon WAF) CAPTCHA — the image-grid or toy-car puzzle '
        + "Amazon's firewall shows on a 405 challenge page (window.gokuProps plus "
        + 'challenge.js/captcha.js from an awswaf.com host) or in a JS-API widget '
        + '(jsapi.js plus AwsWafCaptcha.renderCaptcha). Only sitekey and url are '
        + 'required. IMPORTANT: the answer is NOT the cookie. It is a pair, '
        + 'captcha_voucher and existing_token, which only work together: POST '
        + 'them as JSON {"captcha_voucher":…,"existing_token":…} to the `voucher` '
        + "endpoint in the same folder as the page's challenge.js (replace "
        + "'challenge.js' with 'voucher'), and the response's `token` field is the "
        + 'aws-waf-token. Send that as the aws-waf-token cookie on the protected '
        + 'domain (some widget pages use an x-aws-waf-token header instead) and '
        + 'repeat the request. Exchange the pair immediately rather than storing it.',
      inputSchema,
      outputSchema: amazonWafOutput,
      // Solving a captcha destroys nothing; see capy.ts for why the hint is explicit.
      // Not idempotent: every call draws a fresh puzzle.
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async (args, extra) => {
      // A real browser mints the token the voucher is issued for, so it takes the
      // browser timeout.
      const timeout = args.timeout ?? ctx.config.recaptchaTimeout;

      const options: Record<string, unknown> = {};
      for (const key of ['iv', 'context', 'challenge_script', 'captcha_script', 'jsapiScript', 'proxy'] as const) {
        if (args[key] !== undefined) options[key] = args[key];
      }

      return runSolve(
        ctx,
        extra,
        { label: 'Solving AWS WAF CAPTCHA', timeoutSeconds: timeout },
        (client) => client.amazonWaf(args.sitekey, args.url, options as never),
        (result, seconds) => {
          const voucher = result.captcha_voucher as string | undefined;
          const existingToken = result.existing_token as string | undefined;

          const structured = {
            captchaId: String(result.captchaId ?? ''),
            // The raw answer is an object, which the Node SDK leaves as-is.
            // Stringify it so the declared string output holds the same JSON a
            // plain-text poll would have delivered.
            code: typeof result.code === 'string'
              ? result.code
              : JSON.stringify(result.code ?? ''),
            solveSeconds: Number(seconds.toFixed(2)),
            ...(voucher !== undefined ? { captcha_voucher: voucher } : {}),
            ...(existingToken !== undefined ? { existing_token: existingToken } : {}),
          };

          const exchangeAt = voucherUrl(args.challenge_script);
          return {
            structured,
            text:
              `Solved AWS WAF CAPTCHA in ${structured.solveSeconds}s.\n`
              + 'This is NOT the cookie yet. POST this JSON body, now, to '
              + (exchangeAt
                ? `${exchangeAt}`
                : "the `voucher` endpoint beside the page's challenge.js "
                  + "(its URL with 'challenge.js' replaced by 'voucher')")
              + ':\n'
              + JSON.stringify({
                captcha_voucher: voucher ?? '(missing)',
                existing_token: existingToken ?? '(missing)',
              })
              + '\nThe response\'s `token` field is the aws-waf-token: send it as the '
              + 'aws-waf-token cookie on the protected domain and repeat the request.\n'
              + `(CapSkip captcha id ${structured.captchaId})`,
          };
        },
      );
    },
  );
}
