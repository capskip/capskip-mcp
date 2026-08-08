# Contributing to the CapSkip MCP Server

Thank you for helping improve `capskip-mcp`. This document explains how to set up your environment, run tests, and submit changes.

---

## Prerequisites

- Node.js 18 or newer
- Git
- The CapSkip desktop app (for manual testing against a live instance — the test suite itself does not need it)

---

## Development setup

```bash
# Clone the repository
git clone https://github.com/capskip/capskip-mcp.git
cd capskip-mcp

# Install dependencies
npm install
```

---

## Running tests

Tests use Node's built-in test runner and a mock CapSkip HTTP server — the real CapSkip desktop app does not need to be running and no network access is required.

```bash
# Build, then run all tests
npm test

# Just the build
npm run build

# Just the tests, against an existing build
node --test
```

`node --test` is run with no path or glob argument. That is deliberate: glob
arguments to `--test` require Node 22, and CI also runs on Node 18 and 20.
A bare `node --test` auto-discovers `test/*.test.js` on every supported
version.

### Project layout

```
src/
  config.ts     # CLI flag / env var parsing and validation
  errors.ts     # CapSkip error code -> readable message mapping
  schemas.ts    # zod input/output schemas shared by the tools
  solver.ts     # thin wrapper around the capskip SDK client
  progress.ts   # progress-notification ticker for long solves
  solve.ts      # shared submit/poll solve loop
  server.ts     # MCP server construction and tool registration
  index.ts      # CLI entrypoint (shebang, argv -> config -> server)
  tools/        # one file per tool (status, image, recaptcha, turnstile, geetest)
test/           # test files only — every file here is auto-discovered and run
test-helpers/   # mockServer.js (fake CapSkip) and harness.js (startHarness)
docs/           # Tutorial, Getting Started, API Reference, Troubleshooting
examples/       # Example client configs (Claude Desktop, Claude Code, Cursor, VS Code)
.github/        # GitHub Actions and issue/PR templates
```

**Test helpers must never go under `test/`.** Node's default test discovery
(the bare `node --test` used in `npm test` and in CI) treats every file in
`test/` as a test file and tries to run it. `test-helpers/mockServer.js` (the
fake CapSkip HTTP server) and `test-helpers/harness.js` (`startHarness`, which
wires a real MCP server to an in-memory client against the mock) live outside
`test/` specifically so they are never picked up as tests themselves.

**Every new tool needs a test in `test/` that uses `startHarness`.** See any
existing file such as `test/turnstile.test.js` for the pattern: call
`startHarness()` to get a connected `{ client, close }`, drive the tool
through `client.callTool(...)` exactly as a real MCP client would, and
`close()` it when done.

---

## Code style

- Match the existing code style in `src/` (TypeScript, strict mode)
- Keep changes focused — one feature or fix per pull request
- Add or update tests for any behavior change
- Update documentation in `docs/` and `README.md` when adding or changing a tool
- Keep parameter validation in `schemas.ts` — reject unrecognized keys rather than silently ignoring them

---

## Pull request process

1. Fork the repository and create a feature branch:

   ```bash
   git checkout -b feature/my-improvement
   ```

2. Make your changes and ensure the full suite passes:

   ```bash
   npm test
   ```

3. Update `CHANGELOG.md` under `[Unreleased]` if applicable.

4. Push and open a pull request against `main`.

5. Fill in the pull request template completely.

---

## Reporting bugs

Use the [Bug Report issue template](.github/ISSUE_TEMPLATE/bug_report.yml) and include:

- MCP client and version (Claude Desktop, Claude Code, Cursor, VS Code, or other)
- Node.js version
- CapSkip desktop app version
- The server's **stderr output** — `capskip-mcp` sends all logs and diagnostics
  to stderr, since stdout carries MCP protocol traffic. This is usually the
  fastest way to see what actually went wrong.
- Minimal reproduction steps (redact sitekeys, tokens, and API keys)

---

## Feature requests

`capskip-mcp` only exposes what the CapSkip API itself supports: image
captcha, reCAPTCHA v2/v3, Cloudflare Turnstile, and GeeTest v3.

Before requesting a new tool, confirm the underlying captcha type is
supported by the [CapSkip API docs](https://capskip.com/api-docs/). Use the
[Feature Request template](.github/ISSUE_TEMPLATE/feature_request.yml) for
server-only improvements (configuration, error messages, progress reporting,
and so on).

---

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
