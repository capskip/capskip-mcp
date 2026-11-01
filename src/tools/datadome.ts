import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { dataDomeOutput, pageUrlSchema, proxySchema, timeoutSchema } from '../schemas.js';
import { runSolve } from '../solve.js';
import type { ToolContext } from '../solver.js';

const inputSchema = z.strictObject({
  captcha_url: z
    .string()
    .min(1)
    .describe(
      'The address of the DataDome challenge iframe on geo.captcha-delivery.com: '
      + '/captcha/ for a slider, /interstitial/ for a device check. Take the '
      + "iframe's src from the block page when it has one. Otherwise build it from "
      + "the block page's `var dd={...}` object: path 'interstitial' if dd.rt is 'i', "
      + "else 'captcha'; query initialCid=dd.cid, hash=dd.hsh, cid=dd.cookie, "
      + 't=dd.t (when present), referer=<the page URL>, s=dd.s, e=dd.e (when '
      + 'present), b=dd.b (when present), dm=cd, every value URL-encoded; host '
      + "dd.host or geo.captcha-delivery.com. A dd object with 't':'bv' means the "
      + 'address is banned: change it and fetch the page again instead.',
    ),
  url: pageUrlSchema.describe('Full URL of the page that returned the DataDome block page.'),
  userAgent: z
    .string()
    .min(1)
    .optional()
    .describe(
      'The User-Agent the cookie will be used with. It must be stock Chrome for '
      + 'Windows with the same major version as the browser CapSkip solves with; '
      + 'anything else is refused. Usually leave it out: CapSkip then uses its own '
      + "browser's User-Agent and reports it, and you send that one.",
    ),
  proxy: proxySchema
    .optional()
    .describe(
      'The proxy the requests carrying the cookie will go through. DataDome ties '
      + 'the cookie to the IP that earned it, so solve from the same address you '
      + 'will use it from. Leave it out when those requests leave from the machine '
      + 'running CapSkip.',
    ),
  timeout: timeoutSchema,
});

export function registerDataDomeTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'capskip_solve_datadome',
    {
      title: 'Solve DataDome',
      description:
        'Pass a DataDome challenge — the block page (HTTP 403, sometimes 401) a '
        + 'DataDome-protected site returns instead of its content, with a slider '
        + '(/captcha/) or a device check (/interstitial/) loaded from '
        + 'geo.captcha-delivery.com — and get the `datadome` cookie. Requires '
        + 'captcha_url and url. IMPORTANT: the cookie belongs to ONE IP address and '
        + 'ONE User-Agent. Repeat the request with the returned `cookie` as the '
        + 'Cookie header, the returned `userAgent` as the User-Agent, and from the '
        + 'same IP: through the proxy you passed, or — when the result carries '
        + '`proxy` — through that proxy, which CapSkip picked from its own DataDome '
        + 'proxy list because you passed none. Any other address or User-Agent gets '
        + 'the block page again.',
      inputSchema,
      outputSchema: dataDomeOutput,
      // Solving a captcha destroys nothing; see capy.ts for why the hint is explicit.
      // Not idempotent: every block page is a fresh challenge.
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async (args, extra) => {
      // The challenge is passed in a real browser, so it takes the browser timeout.
      const timeout = args.timeout ?? ctx.config.recaptchaTimeout;

      const options: Record<string, unknown> = {};
      if (args.userAgent !== undefined) options.userAgent = args.userAgent;
      if (args.proxy !== undefined) options.proxy = args.proxy;

      return runSolve(
        ctx,
        extra,
        { label: 'Solving DataDome', timeoutSeconds: timeout },
        (client) => client.dataDome(args.captcha_url, args.url, options as never),
        (result, seconds) => {
          const code = String(result.code ?? '');
          const cookie = (result.cookie as string | undefined) ?? code.split(';')[0].trim();
          const userAgent = result.userAgent as string | undefined;
          const listProxy = result.proxy as string | undefined;

          const structured = {
            captchaId: String(result.captchaId ?? ''),
            code,
            solveSeconds: Number(seconds.toFixed(2)),
            cookie,
            ...(userAgent !== undefined ? { userAgent } : {}),
            ...(listProxy !== undefined ? { proxy: listProxy } : {}),
          };

          let route: string;
          if (listProxy !== undefined) {
            route = `Send it through this proxy, which CapSkip took from its own DataDome `
              + `proxy list because none was passed — the cookie works ONLY from that `
              + `address (named without its login): ${listProxy}\n`;
          } else if (args.proxy !== undefined) {
            // Not echoed: the uri may carry the proxy's login.
            route = 'Send it through the same proxy you passed with this solve — the '
              + 'cookie works only from that address.\n';
          } else {
            route = 'Send it from this machine\'s own IP address, with no proxy — that is '
              + 'the address the cookie was earned from.\n';
          }

          return {
            structured,
            text:
              `Solved DataDome in ${structured.solveSeconds}s.\n`
              + 'Repeat the request to the page with this Cookie header:\n'
              + `Cookie: ${cookie}\n`
              + (userAgent !== undefined
                ? `with this exact User-Agent, the one the cookie was earned with:\n`
                  + `User-Agent: ${userAgent}\n`
                : 'with the same User-Agent you passed.\n')
              + route
              + 'Keep any newer datadome cookie the site sets later. If the block page '
              + 'comes back, build a new captcha_url from it and solve again.\n'
              + `Full Set-Cookie value (for a cookie jar): ${code}\n`
              + `(CapSkip captcha id ${structured.captchaId})`,
          };
        },
      );
    },
  );
}
