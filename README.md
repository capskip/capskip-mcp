# CapSkip MCP Server

[![Node.js 18+](https://img.shields.io/badge/node-18%2B-brightgreen.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Tests](https://github.com/capskip/capskip-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/capskip/capskip-mcp/actions/workflows/ci.yml)

An [MCP](https://modelcontextprotocol.io) server that lets AI agents — Claude Desktop, Claude Code, Cursor, VS Code — solve captchas through the [CapSkip](https://capskip.com) **local** captcha solver instead of stalling on them.

CapSkip runs on your machine as a desktop app and exposes a captcha-solver HTTP API on `127.0.0.1:8080`. It is licensed once, not billed per solve. `capskip-mcp` is a thin translation layer over that API — the fifth official CapSkip client, alongside the Python, Node.js, PHP, and .NET SDKs.

---

## Quick start (5 minutes)

### 1. Install CapSkip

Download and run the CapSkip desktop app from [capskip.com](https://capskip.com). Leave it running in the background.

In CapSkip settings, note:

- **API port** (default: `8080`)
- **API key** (optional — if validation is disabled, any string works)

### 2. Add capskip-mcp to your client

No install step — `npx` downloads and runs `capskip-mcp` on demand.

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

| Client | Config file | Example |
|---|---|---|
| Claude Desktop | `claude_desktop_config.json` | [examples/claude-desktop.json](examples/claude-desktop.json) |
| Claude Code | `claude mcp add` (CLI) | [examples/claude-code.md](examples/claude-code.md) |
| Cursor | `.cursor/mcp.json` | [examples/cursor.json](examples/cursor.json) |
| VS Code | `.vscode/mcp.json` | [examples/vscode.json](examples/vscode.json) |

### 3. Restart your client

Restart so it picks up the new server. It should list five tools, all prefixed `capskip_`.

### 4. Ask your agent to solve something

> "Call capskip_status to confirm CapSkip is running, then solve the reCAPTCHA on this page and submit the form."

The agent reads the sitekey off the page, calls `capskip_solve_recaptcha`, and places the returned token in the page's `g-recaptcha-response` field.

---

## Tools

| Tool | Purpose | Required arguments |
|---|---|---|
| `capskip_status` | Check whether the CapSkip desktop app is running and reachable | none |
| `capskip_solve_image_captcha` | Read the text out of a distorted-text captcha image | `image` |
| `capskip_solve_recaptcha` | Solve a Google reCAPTCHA v2 or v3 widget, including invisible and Enterprise variants | `sitekey`, `url` |
| `capskip_solve_turnstile` | Solve a Cloudflare Turnstile widget or interstitial challenge page | `sitekey`, `url` |
| `capskip_solve_geetest` | Solve a GeeTest v3 slide-puzzle captcha | `gt`, `challenge`, `url` |

These four types are all CapSkip supports. **hCaptcha and FunCaptcha/Arkose cannot be solved** — there is no tool for them, and `capskip_solve_recaptcha` will not work on one. hCaptcha is the easiest to misidentify, since it also carries a `data-sitekey`; check for `class="h-captcha"` or a `js.hcaptcha.com` script before choosing a tool.

> **There is no `min_score` parameter on `capskip_solve_recaptcha`.** reCAPTCHA v3 scores are assigned by Google from signals CapSkip has no access to — no solver, local or cloud, can raise a score after the fact. A `min_score` option would promise control that does not exist, so it is deliberately left out. Passing it anyway is rejected as an unrecognized key, not silently ignored.

Full parameter tables and worked examples: [API Reference](docs/API_REFERENCE.md).

| Guide | Description |
|---|---|
| [Tutorial](docs/TUTORIAL.md) | Every captcha type — how to recognize it, what to read off the page, what call to make, where the answer goes |
| [Getting Started](docs/GETTING_STARTED.md) | Full setup: CapSkip app, client config, first solve |
| [API Reference](docs/API_REFERENCE.md) | Every tool, parameter, and return shape |
| [Troubleshooting](docs/TROUBLESHOOTING.md) | Connection errors, timeouts, rejected tokens |

---

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `CAPSKIP_API_KEY` | `capskip` | Any string when key validation is off |
| `CAPSKIP_HOST` | `127.0.0.1` | CapSkip host |
| `CAPSKIP_PORT` | `8080` | API port from CapSkip settings |
| `CAPSKIP_TIMEOUT` | `120` | Default `timeout` for `capskip_solve_image_captcha`, seconds |
| `CAPSKIP_RECAPTCHA_TIMEOUT` | `300` | Default `timeout` for `capskip_solve_recaptcha` / `capskip_solve_turnstile` / `capskip_solve_geetest`, seconds |
| `CAPSKIP_POLLING_INTERVAL` | `5` | Max seconds between polls |

CLI flags override environment variables, which override the defaults above:

```
capskip-mcp --api-key <key> --host <host> --port <port> --timeout <seconds> \
            --recaptcha-timeout <seconds> --polling-interval <seconds>
```

An invalid value (non-numeric port, port outside 1–65535, a negative or out-of-range timeout, an unknown flag) fails at startup with a message naming the offending flag or variable, rather than surfacing later as a confusing solve failure.

---

## What you get back

Every solve tool returns both a human-readable text block and `structuredContent` matching its declared output schema:

```json
{
  "captchaId": "12345",
  "code": "03AGdBq26f...",
  "solveSeconds": 11.8
}
```

- **`capskip_solve_turnstile`** adds `userAgent`. Submit the token with this exact User-Agent — Cloudflare rejects a token replayed under a different one.
- **`capskip_solve_geetest`** adds `challenge`, `validate`, and `seccode`, to post back exactly as the site's own front-end would; `code` keeps the raw JSON string CapSkip returns.

---

## Errors

Every tool call returns `isError: true` with readable text on failure — never a stack trace or a bare protocol error — so the model can read the message and correct course.

| Cause | Message |
|---|---|
| CapSkip unreachable | `CapSkip is not reachable at <host>:<port>. Confirm the CapSkip desktop app is running and that its API port matches this setting (override with CAPSKIP_HOST / CAPSKIP_PORT).` |
| Another process holds the port | `Something is listening on <host>:<port> but it did not answer as CapSkip (HTTP <code>). Check the API port in CapSkip settings, and that nothing else has taken that port — override with CAPSKIP_HOST / CAPSKIP_PORT.` |
| Wrong API key (`ERROR_KEY_DOES_NOT_EXIST` / `ERROR_WRONG_USER_KEY`) | `CapSkip rejected the API key. Set CAPSKIP_API_KEY to the key shown in CapSkip settings, or disable key validation there.` |
| `ERROR_CAPTCHA_UNSOLVABLE` | `CapSkip could not solve this captcha. Fetch a fresh sitekey or challenge from the page and try again.` |
| `ERROR_GOOGLEKEY` | `CapSkip rejected the sitekey. Re-read data-sitekey from the page and retry.` |
| `ERROR_PAGEURL` | `CapSkip rejected the url. Pass the full page URL, including its scheme.` |
| `ERROR_INVALID_IMAGE` | `CapSkip could not read that image. Check the file is a valid, uncorrupted PNG or JPEG.` |
| `ERROR_BAD_PARAMETERS` | `CapSkip rejected the parameters for this captcha type. Re-check the values supplied.` |
| Solve exceeded `timeout` | `The solve did not finish within <elapsed>s. Raise the timeout parameter, or check CapSkip's own queue.` — plus the CapSkip captcha id when one was assigned, so a solve that finishes just after the deadline can still be read back via `res.php` or any CapSkip SDK |
| Unknown or misspelled parameter | Rejected before the call reaches CapSkip, naming the key, e.g. `Unrecognized key: "min_score"` |

See [Troubleshooting](docs/TROUBLESHOOTING.md) for fixes.

---

## Requirements

- Node.js 18 or newer
- The CapSkip desktop app installed and running (download from [capskip.com](https://capskip.com))

---

## Links

- [CapSkip website](https://capskip.com)
- [CapSkip API docs](https://capskip.com/api-docs/)
- [Python SDK](https://github.com/capskip/capskip-python)
- [Node.js SDK](https://github.com/capskip/capskip-node)
- [PHP SDK](https://github.com/capskip/capskip-php)
- [.NET SDK](https://github.com/capskip/capskip-dotnet)
- [Report an issue](https://github.com/capskip/capskip-mcp/issues)

---

## License

MIT — see [LICENSE](LICENSE).
