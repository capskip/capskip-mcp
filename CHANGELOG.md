# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Nothing yet. Add entries here as changes land; they move into a version
section at release time.

## [1.4.0] - 2026-11-02

### Added

- **`capskip_solve_datadome`** — pass a DataDome challenge, the slider
  (`/captcha/`) or the device check (`/interstitial/`) on a DataDome block page,
  and get the `datadome` cookie. Requires `captcha_url` and `url`; optional
  `userAgent` and `proxy`. The result carries `cookie` (the `datadome=...` pair
  for a Cookie header), `code` (the full Set-Cookie value), `userAgent` (the one
  the cookie was earned with) and, when no proxy was passed and the CapSkip app
  solved through its own DataDome proxy list, `proxy` as `host:port`. The text
  reply spells out the Cookie header, the User-Agent and which address to send
  from, because the cookie works for one IP and one User-Agent only.
- Output schema `dataDomeOutput`.
- Error guidance for `ERROR_WRONG_USERAGENT`, `ERROR_PROXY_BANNED`,
  `ERROR_PROXY_CONNECT_REFUSED` and `ERROR_PROXY_FORMAT`.

### Changed

- Requires `capskip` (the Node SDK) `^1.5.0`, which is where `dataDome()` lives.
- The server's instructions now list DataDome among the types it can solve.

### Notes

- DataDome uses `CAPSKIP_RECAPTCHA_TIMEOUT`: the challenge is passed in a real
  browser.

## [1.3.0] - 2026-11-01

### Added

- **`capskip_solve_amazon_waf`** — solve an AWS WAF (Amazon WAF) CAPTCHA, on a
  405 challenge page or in a JS-API widget. Only `sitekey` and `url` are
  required; optional `iv` / `context` (both or neither), `challenge_script`,
  `captcha_script`, `jsapiScript` and `proxy`. The answer is **not the cookie**:
  the result carries `captcha_voucher` and `existing_token`, and the text reply
  says to POST them to the `voucher` endpoint beside the page's challenge.js
  (naming the exact URL when `challenge_script` was passed), whose `token` is
  the `aws-waf-token`.
- Output schema `amazonWafOutput`.

### Changed

- Requires `capskip` (the Node SDK) `^1.4.0`, which is where `amazonWaf()` lives.
- The server's instructions now list AWS WAF among the types it can solve.

### Fixed

- The docs named `CAPSKIP_DEFAULT_TIMEOUT`, which does not exist, and listed
  stale tool and type counts. The variable is `CAPSKIP_TIMEOUT`.

### Notes

- AWS WAF uses `CAPSKIP_RECAPTCHA_TIMEOUT`: a real browser mints the token the
  voucher is issued for.

## [1.2.0] - 2026-09-22

### Added

- **`capskip_solve_capy`** — solve a Capy Puzzle captcha. Unlike every other
  solve tool, the answer is **not a token**: the result carries `captchakey`,
  `challengekey` and `answer`, which all go into the target form's
  `capy_captchakey`, `capy_challengekey` and `capy_answer` fields. The text reply
  names all three, since an agent acting on `code` alone would post a JSON blob
  into a field expecting a drag path. Optional `api_server` and `proxy`.
- **`capskip_solve_captchafox`** — solve a CaptchaFox challenge. Returns `token`
  for the form's `cf-captcha-response` field, plus `userAgent` when the solve
  reported one: the UA the browser actually minted the token under, which is not
  one the caller sent. Optional `api_server` selects the widget source (the MAM
  package returns a `MAM_` prefixed token) and `proxy`.
- **`capskip_solve_friendly_captcha`** — solve a Friendly Captcha proof-of-work
  challenge. Takes `version` (`v1`/`v2`) or `module_script` / `nomodule_script`
  so CapSkip can read the version off the build the site loads, plus optional
  `api_server` for the data-residency tenant and `proxy`. The text reply names
  the form field for the version that was actually solved —
  `frc-captcha-solution` on v1, `frc-captcha-response` on v2 — because mixing
  those up is the single most common way a working integration breaks.
- Output schemas `capyOutput`, `captchaFoxOutput` and `friendlyCaptchaOutput`.

### Changed

- Requires `capskip` (the Node SDK) `^1.3.0`, which is where the three new solve
  methods live.
- The server's instructions now list Capy, CaptchaFox and Friendly Captcha among
  the types it can solve, so a client choosing a tool from the listing sees them.

### Notes

- CaptchaFox and Friendly Captcha use `CAPSKIP_RECAPTCHA_TIMEOUT`: the first is a
  real browser solve, and the second has its difficulty set per request by the
  service (and always solves in a browser on v2). Capy uses
  `CAPSKIP_TIMEOUT` — it is one HTTP fetch plus pixel math, though it still takes
  about two seconds because Capy refuses answers that arrive faster than a human
  could have produced them.

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
- `number` is reported for both ALTCHA generations — the legacy scheme and
  proof-of-work v2 (PBKDF2/SHA), whose token carries no top-level `number` at
  all. Verified against live v1 and v2 deployments.

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
