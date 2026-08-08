# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
