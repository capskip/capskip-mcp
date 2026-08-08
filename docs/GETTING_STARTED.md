# Getting Started

This guide walks you through installing CapSkip, adding `capskip-mcp` to your MCP client, and running your first captcha solve.

---

## Prerequisites

| Requirement | Details |
|---|---|
| **CapSkip app** | Windows desktop app from [capskip.com](https://capskip.com) |
| **Node.js** | 18 or newer (`capskip-mcp` runs via `npx`, no separate install) |
| **An MCP client** | Claude Desktop, Claude Code, Cursor, or VS Code |

---

## Step 1 — Install and configure CapSkip

1. Download CapSkip from [capskip.com](https://capskip.com).
2. Install and launch the application. Leave it running in the background — `capskip-mcp` talks to it over `localhost`, so it must be running whenever a tool is called.
3. Open **Settings** and note:
   - **Port** — default is `8080`
   - **API key validation** — if enabled, copy your API key; if disabled, any string (e.g. `capskip`) is accepted

### Verify CapSkip is running

**Windows (PowerShell):**

```powershell
Invoke-WebRequest "http://127.0.0.1:8080/res.php?key=capskip&action=get&id=0" -UseBasicParsing
```

**Linux / macOS:**

```bash
curl "http://127.0.0.1:8080/res.php?key=capskip&action=get&id=0"
```

Any response — even an error like `ERROR_WRONG_CAPTCHA_ID` — confirms CapSkip is up and listening.

---

## Step 2 — Add capskip-mcp to your client

Every client points at the same command:

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

Substitute your own port and API key from Step 1. Where that block goes differs per client:

### Claude Desktop

Open **Settings → Developer → Edit Config** (or edit `claude_desktop_config.json` directly — `%APPDATA%\Claude\claude_desktop_config.json` on Windows, `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS) and paste the block above. Full file: [examples/claude-desktop.json](../examples/claude-desktop.json).

### Claude Code

Add the server from the command line — no config file to edit:

```bash
claude mcp add capskip -- npx -y capskip-mcp
```

See [examples/claude-code.md](../examples/claude-code.md) for the custom-port variant and how to confirm it connected.

### Cursor

Paste the block above into `.cursor/mcp.json` (project-level) or your global Cursor MCP settings. Full file: [examples/cursor.json](../examples/cursor.json).

### VS Code

VS Code's MCP config uses `servers` instead of `mcpServers` and an explicit `type`:

```json
{
  "servers": {
    "capskip": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "capskip-mcp"],
      "env": { "CAPSKIP_PORT": "8080" }
    }
  }
}
```

Paste this into `.vscode/mcp.json`. Full file: [examples/vscode.json](../examples/vscode.json).

---

## Step 3 — Verify with `capskip_status`

Restart your client, open a new chat, and ask it to call `capskip_status` (no arguments). With CapSkip running on the configured host and port, the tool returns:

```json
{
  "reachable": true,
  "host": "127.0.0.1",
  "port": 8080,
  "latencyMs": 6,
  "detail": "CapSkip answered at 127.0.0.1:8080 in 6ms."
}
```

If CapSkip is not running, or the port is wrong, `capskip_status` still returns a normal (non-error) result — it reports the problem rather than failing — with `reachable: false` and a `detail` explaining what to check:

```json
{
  "reachable": false,
  "host": "127.0.0.1",
  "port": 8080,
  "detail": "No response from 127.0.0.1:8080 (connect ECONNREFUSED 127.0.0.1:8080). Start the CapSkip desktop app, then confirm its API port matches — override with CAPSKIP_HOST / CAPSKIP_PORT."
}
```

---

## Step 4 — Your first solve

With CapSkip confirmed reachable, ask your agent to solve a captcha it has encountered while browsing, or try it directly. For a reCAPTCHA v2 widget with sitekey `6Le-wvkSAAAAAPBMRTvw0Q4Muexq9bi0DJwx_mJ-` on `https://example.com/login`, the agent calls:

```json
{
  "sitekey": "6Le-wvkSAAAAAPBMRTvw0Q4Muexq9bi0DJwx_mJ-",
  "url": "https://example.com/login"
}
```

against `capskip_solve_recaptcha`, and gets back:

```json
{
  "captchaId": "48213",
  "code": "03AGdBq26f...",
  "solveSeconds": 9.4
}
```

`code` is the token — it goes in the page's `g-recaptcha-response` field before the form is submitted.

---

## Next steps

- [Tutorial](TUTORIAL.md) — every captcha type, end to end
- [API Reference](API_REFERENCE.md) — every tool, parameter, and return shape
- [Troubleshooting](TROUBLESHOOTING.md) — fix common errors
- [CapSkip API docs](https://capskip.com/api-docs/) — the raw HTTP API `capskip-mcp` wraps
