# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Nothing yet. Add entries here as changes land; they move into a version
section at release time.

## [1.1.0] - 2026-09-12

### Added

- **`capskip_solve_altcha`** — solve an ALTCHA proof-of-work challenge. Takes
  `url` plus one of `challenge_url` (the endpoint the `<altcha-widget>` fetches
  from, which CapSkip fetches for you) or `challenge_json` (the challenge
  document itself, solved locally with no network request). Returns `token`, the
  payload to submit verbatim in the site's form field named `altcha`, and
  `number`, the counter that solved it.
- Calling it with neither challenge parameter returns an error naming what is
  missing, and where to find it, rather than spending a round trip to learn
  CapSkip's `ERROR_BAD_PARAMETERS`.

### Changed

- Requires `capskip` >= 1.2.0, which is where `altcha()` was added.
- The server instructions now list ALTCHA among the solvable types.

### Notes

- ALTCHA uses `CAPSKIP_DEFAULT_TIMEOUT`, not `CAPSKIP_RECAPTCHA_TIMEOUT` — it is
  CPU proof-of-work measured in milliseconds, not a browser solve.
- A `proxy` passed to this tool applies only to the `challenge_url` fetch; an
  inline `challenge_json` never touches the network.

## [1.0.0] - 2026-08-09

### Added

- `capskip_status` — check that the CapSkip desktop app is running and reachable.
- `capskip_solve_image_captcha` — read the text from a distorted-text captcha.
- `capskip_solve_recaptcha` — reCAPTCHA v2 and v3, including invisible and Enterprise.
- `capskip_solve_turnstile` — Cloudflare Turnstile widgets and challenge pages,
  returning the User-Agent the token must be submitted with.
- `capskip_solve_geetest` — GeeTest v3 sliders, returning `geetest_challenge`,
  `geetest_validate`, and `geetest_seccode`.
- Progress notifications during long solves, so MCP clients do not time out.
- Configuration via `CAPSKIP_*` environment variables or CLI flags.

[Unreleased]: https://github.com/capskip/capskip-mcp/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/capskip/capskip-mcp/releases/tag/v1.0.0
