# CapSkip MCP Server — Unlimited Captcha Solver for AI Agents

[![Node.js 18+](https://img.shields.io/badge/node-18%2B-brightgreen.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Tests](https://github.com/capskip/capskip-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/capskip/capskip-mcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/capskip-mcp.svg)](https://www.npmjs.com/package/capskip-mcp)

**A captcha solver [MCP](https://modelcontextprotocol.io) server that lets AI agents solve reCAPTCHA, Cloudflare Turnstile, GeeTest and image captchas instead of stalling on them.**

Works with Claude Desktop, Claude Code, Cursor, VS Code, and any Model Context Protocol client. Powered by [CapSkip](https://capskip.com) — a **local captcha solver** that runs on your own machine, licensed once rather than billed per solve.

```bash
npx -y capskip-mcp
```

---

## What this solves

An AI agent driving a browser hits a captcha and stops. This server gives it five tools so it can read the sitekey, solve the challenge, and carry on — without a human stepping in and without a per-solve API bill.

CapSkip runs as a desktop app exposing a captcha-solving HTTP API on `127.0.0.1:8080`. `capskip-mcp` is a thin translation layer over that API: the fifth official CapSkip client, alongside the [Python](https://github.com/capskip/capskip-python), [Node.js](https://github.com/capskip/capskip-node), [PHP](https://github.com/capskip/capskip-php) and [.NET](https://github.com/capskip/capskip-dotnet) SDKs.

## Supported captcha types

| Captcha | Tool | Notes |
|---|---|---|
| **reCAPTCHA v2 solver** (checkbox) | `capskip_solve_recaptcha` | Returns a `g-recaptcha-response` token |
| **reCAPTCHA v2 invisible solver** | `capskip_solve_recaptcha` | Pass `invisible: true` |
| **reCAPTCHA Enterprise solver** | `capskip_solve_recaptcha` | Pass `enterprise: true`, works with v2 and v3 |
| **reCAPTCHA v3 solver** | `capskip_solve_recaptcha` | Pass `version: "v3"` and the page's `action` |
| **Cloudflare Turnstile solver** | `capskip_solve_turnstile` | Widget and interstitial challenge pages |
| **GeeTest v3 solver** | `capskip_solve_geetest` | Slide puzzle; returns challenge/validate/seccode |
| **Image captcha solver** (text/OCR) | `capskip_solve_image_captcha` | File path, URL, data URI, or base64 |

**Not supported: hCaptcha and FunCaptcha/Arkose.** There is no tool for them and `capskip_solve_recaptcha` will not work on one. hCaptcha is the easiest to misidentify since it also carries a `data-sitekey` — check for `class="h-captcha"` or a `js.hcaptcha.com` script first.

Try them against live widgets on the [captcha demo pages](https://capskip.com/captcha-demo/).

---

## Quick start (5 minutes)

### 1. Install the CapSkip captcha solver

Download and run the CapSkip desktop app from [capskip.com](https://capskip.com). Leave it running in the background.

In CapSkip settings, note the **API port** (default `8080`) and **API key** (optional — if key validation is disabled, any string works).

### 2. Add capskip-mcp to your MCP client

No install step — `npx` fetches and runs it on demand.

```json
{
  "mcpServers": {
    "capskip": {
      "command": "npx",
      "args": ["-y", "capskip-mcp"],
      "env": {
        "CAPSKIP_HOST": "127.0.0.1",
        "CAPSKIP_PORT": "8080",
        "CAPSKIP_API_KEY": "capskip"
      }
    }
  }
}
```

| MCP client | Config file | Example |
|---|---|---|
| Claude Desktop | `claude_desktop_config.json` | [examples/claude-desktop.json](examples/claude-desktop.json) |
| Claude Code | `claude mcp add` (CLI) | [examples/claude-code.md](examples/claude-code.md) |
| Cursor | `.cursor/mcp.json` | [examples/cursor.json](examples/cursor.json) |
| VS Code | `.vscode/mcp.json` | [examples/vscode.json](examples/vscode.json) |

### 3. Restart your client

It should list five tools, all prefixed `capskip_`.

### 4. Ask your agent to solve a captcha

> "Call capskip_status to confirm CapSkip is running, then solve the reCAPTCHA on this page and submit the form."

The agent reads the sitekey off the page, calls `capskip_solve_recaptcha`, and places the returned token in the page's `g-recaptcha-response` field.

---

## Why a local captcha solver

Cloud captcha APIs bill per solve, so an agent that retries is an agent that costs money, and every page URL and sitekey you solve leaves your network.

CapSkip runs on your machine:

- **Unlimited captcha solving** — licensed once, no per-solve fees, no credit balance to top up
- **Local by default** — the solver talks to `127.0.0.1`; nothing is proxied through a third-party queue
- **No rate limit per key** — throughput is bounded by your machine, not a vendor's plan tier
- **Fast** — image captchas return in well under a second; typical reCAPTCHA v2 solves land in 30–45s

### Using an existing 2captcha or Anti-Captcha integration?

CapSkip exposes the familiar `in.php` / `res.php` endpoints, so it works as a **2captcha API alternative** — point your existing client at `127.0.0.1:8080` and keep your code. See the [migration notes](https://capskip.com/2captcha-api-alternative/). This MCP server is the equivalent for AI agents rather than scripts.

---

## Tools

| Tool | Purpose | Required arguments |
|---|---|---|
| `capskip_status` | Check whether the CapSkip desktop app is running and reachable | none |
| `capskip_solve_image_captcha` | Read the text out of a distorted-text captcha image | `image` |
| `capskip_solve_recaptcha` | Solve reCAPTCHA v2 or v3, including invisible and Enterprise | `sitekey`, `url` |
| `capskip_solve_turnstile` | Solve a Cloudflare Turnstile widget or challenge page | `sitekey`, `url` |
| `capskip_solve_geetest` | Solve a GeeTest v3 slide-puzzle captcha | `gt`, `challenge`, `url` |

> **There is no `min_score` parameter on `capskip_solve_recaptcha`.** reCAPTCHA v3 scores are assigned by Google from signals no solver has access to — local or cloud, none can raise a score after the fact. A `min_score` option would promise control that does not exist, so it is deliberately left out. Passing it anyway is rejected as an unrecognized key, not silently ignored.

Full parameter tables and worked examples: [API Reference](docs/API_REFERENCE.md).

| Guide | Description |
|---|---|
| [Tutorial](docs/TUTORIAL.md) | Every captcha type — how to recognize it, what to read off the page, what call to make, where the answer goes |
| [Getting Started](docs/GETTING_STARTED.md) | Full setup: CapSkip app, client config, first solve |
| [API Reference](docs/API_REFERENCE.md) | Every tool, parameter, and return shape |
| [Troubleshooting](docs/TROUBLESHOOTING.md) | Connection errors, timeouts, rejected tokens |

---

## Browser automation: Playwright, Puppeteer and Selenium

This server solves the captcha and hands back a token; your agent's existing browser tooling does the driving. The pattern is the same whichever you use:

1. Read the sitekey from the page (`data-sitekey`, or the widget's config object).
2. Call the matching `capskip_solve_*` tool with that sitekey and the page URL.
3. Write the token into the response field and submit.

```js
// The agent does this via its browser tool after capskip_solve_recaptcha returns
document.querySelector('#g-recaptcha-response').value = TOKEN;
```

For non-agent scripts, use the language SDKs directly — see the [Playwright](https://capskip.com/playwright-captcha-solver/), [Puppeteer](https://capskip.com/puppeteer-captcha-solver/) and [Selenium](https://capskip.com/selenium-captcha-solver/) guides.

---

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `CAPSKIP_API_KEY` | `capskip` | Any string when key validation is off |
| `CAPSKIP_HOST` | `127.0.0.1` | CapSkip host |
| `CAPSKIP_PORT` | `8080` | API port from CapSkip settings |
| `CAPSKIP_TIMEOUT` | `120` | Default `timeout` for `capskip_solve_image_captcha`, seconds |
| `CAPSKIP_RECAPTCHA_TIMEOUT` | `300` | Default `timeout` for the reCAPTCHA / Turnstile / GeeTest tools, seconds |
| `CAPSKIP_POLLING_INTERVAL` | `5` | Max seconds between polls |

CLI flags override environment variables, which override the defaults:

```
capskip-mcp --api-key <key> --host <host> --port <port> --timeout <seconds> \
            --recaptcha-timeout <seconds> --polling-interval <seconds>
```

An invalid value (non-numeric port, port outside 1–65535, a negative or out-of-range timeout, an unknown flag) fails at startup naming the offending flag or variable, rather than surfacing later as a confusing solve failure.

---

## What you get back

Every solve tool returns a human-readable text block and `structuredContent` matching its declared output schema:

```json
{
  "captchaId": "12345",
  "code": "03AGdBq26f...",
  "solveSeconds": 11.8
}
```

- **`capskip_solve_turnstile`** adds `userAgent`. Submit the token with this exact User-Agent — Cloudflare rejects a token replayed under a different one.
- **`capskip_solve_geetest`** adds `challenge`, `validate` and `seccode`, to post back exactly as the site's own front-end would; `code` keeps the raw JSON string CapSkip returns.

Long solves emit MCP progress notifications, so a 45-second reCAPTCHA does not trip your client's tool-call timeout.

---

## Errors

Every tool call returns `isError: true` with readable text on failure — never a stack trace or a bare protocol error — so the model can read the message and correct course.

| Cause | Message |
|---|---|
| CapSkip unreachable | `CapSkip is not reachable at <host>:<port>. Confirm the CapSkip desktop app is running and that its API port matches this setting (override with CAPSKIP_HOST / CAPSKIP_PORT).` |
| Another process holds the port | `Something is listening on <host>:<port> but it did not answer as CapSkip (HTTP <code>). Check the API port in CapSkip settings, and that nothing else has taken that port — override with CAPSKIP_HOST / CAPSKIP_PORT.` |
| Wrong API key | `CapSkip rejected the API key. Set CAPSKIP_API_KEY to the key shown in CapSkip settings, or disable key validation there.` |
| `ERROR_CAPTCHA_UNSOLVABLE` | `CapSkip could not solve this captcha. Fetch a fresh sitekey or challenge from the page and try again.` |
| `ERROR_GOOGLEKEY` | `CapSkip rejected the sitekey. Re-read data-sitekey from the page and retry.` |
| `ERROR_PAGEURL` | `CapSkip rejected the url. Pass the full page URL, including its scheme.` |
| `ERROR_INVALID_IMAGE` | `CapSkip could not read that image. Check the file is a valid, uncorrupted PNG or JPEG.` |
| `ERROR_BAD_PARAMETERS` | `CapSkip rejected the parameters for this captcha type. Re-check the values supplied.` |
| Solve exceeded `timeout` | `The solve did not finish within <elapsed>s. Raise the timeout parameter, or check CapSkip's own queue.` — plus the captcha id when one was assigned |
| Unknown or misspelled parameter | Rejected before the call reaches CapSkip, naming the key, e.g. `Unrecognized key: "min_score"` |

See [Troubleshooting](docs/TROUBLESHOOTING.md) for fixes.

---

## FAQ

### Can AI agents solve captchas?

Not on their own — a model cannot produce a valid reCAPTCHA or Turnstile token. It needs a solver. This MCP server connects your agent to CapSkip so it can request a real token and continue the task.

### Does this work with Claude, Cursor and VS Code?

Yes. It is a standard MCP stdio server, so it works with any Model Context Protocol client, including Claude Desktop, Claude Code, Cursor and VS Code. Config examples for each are in [examples/](examples/).

### Is there a free captcha solver here?

The MCP server is MIT-licensed and free. It requires the CapSkip desktop app, which is licensed once and then solves without per-solve charges — unlike cloud APIs that bill per captcha.

### Which captchas can it solve?

reCAPTCHA v2 (checkbox and invisible), reCAPTCHA v3, reCAPTCHA Enterprise, Cloudflare Turnstile, GeeTest v3, and image/text captchas. hCaptcha and FunCaptcha/Arkose are not supported.

### Why does my reCAPTCHA v3 token get a low score?

Google assigns v3 scores from signals such as IP reputation and browsing history. A solver returns a valid token, but cannot raise the score. If a site enforces a high threshold, solve from a cleaner IP — a proxy is supported on the reCAPTCHA, Turnstile and GeeTest tools.

### Does it need my captcha to be on a public page?

Yes for widget captchas — CapSkip loads the page URL you pass. Image captchas need only the image, which can be a local file.

### Can I use it with Playwright or Puppeteer?

Yes. The agent drives the browser; this server supplies the token. See the [browser automation section](#browser-automation-playwright-puppeteer-and-selenium).

---

## Requirements

- Node.js 18 or newer
- The CapSkip desktop app installed and running ([download](https://capskip.com))

## Links

- [CapSkip — unlimited captcha solver](https://capskip.com)
- [Captcha demo pages](https://capskip.com/captcha-demo/) — live reCAPTCHA, Turnstile, GeeTest and image widgets
- [HTTP API docs](https://capskip.com/api-docs/)
- SDKs: [Python](https://github.com/capskip/capskip-python) · [Node.js](https://github.com/capskip/capskip-node) · [PHP](https://github.com/capskip/capskip-php) · [.NET](https://github.com/capskip/capskip-dotnet)
- [Report an issue](https://github.com/capskip/capskip-mcp/issues)

## License

MIT — see [LICENSE](LICENSE).
