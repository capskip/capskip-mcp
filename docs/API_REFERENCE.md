# CapSkip MCP Server — API Reference

Complete reference for all five tools `capskip-mcp` registers. Parameter descriptions below are copied verbatim from each tool's schema in `src/tools/` so this document cannot drift from what a client actually sees when it lists tools.

Every solve tool declares an `outputSchema` and returns MCP `structuredContent` matching it, plus a human-readable text block for clients that do not render structured output. Every tool schema rejects unknown keys — a misspelled or unsupported parameter is rejected by name rather than silently ignored.

---

## Tools at a glance

| Tool | Purpose | Proxy support |
|---|---|---|
| `capskip_status` | Check whether CapSkip is running and reachable | n/a |
| `capskip_solve_image_captcha` | Read the text out of a distorted-text captcha image | No |
| `capskip_solve_recaptcha` | Solve a Google reCAPTCHA v2 or v3 widget | Yes |
| `capskip_solve_turnstile` | Solve a Cloudflare Turnstile widget or challenge page | Yes |
| `capskip_solve_geetest` | Solve a GeeTest v3 slide-puzzle captcha | Yes |
| `capskip_solve_altcha` | Solve an ALTCHA proof-of-work challenge | Yes (challenge fetch only) |

---

## `capskip_status`

Check whether the CapSkip desktop app is running and reachable. Call this first when a solve fails unexpectedly, to tell "CapSkip is not running" apart from "the sitekey was wrong". Takes no arguments.

### Parameters

None. The tool rejects any argument it is passed, naming the key.

### Output shape

| Field | Type | Always present | Description |
|---|---|---|---|
| `reachable` | boolean | yes | Whether CapSkip itself answered |
| `host` | string | yes | Host that was probed |
| `port` | number | yes | Port that was probed |
| `latencyMs` | number | whenever anything answered | Round-trip time of the probe |
| `detail` | string | yes | Human-readable summary — also the tool's text output |

`capskip_status` never returns `isError: true` for an unreachable CapSkip; it reports the problem in `reachable` / `detail` instead, so the model can read the result rather than handle an error.

The probe reads the response, not merely the fact that one arrived. Four outcomes are distinguished:

| Situation | `reachable` | `detail` says |
|---|---|---|
| CapSkip answered normally | `true` | `CapSkip answered at <host>:<port> in <n>ms.` |
| CapSkip answered but rejected the API key | `true` | `CapSkip is running at <host>:<port>, but it rejected the API key. …` |
| Something else holds the port | `false` | `Something is listening on <host>:<port> but it did not answer as CapSkip (HTTP <code>). …` |
| Nothing answered | `false` | `No response from <host>:<port> (<error>). …` |

A rejected key counts as reachable on purpose: CapSkip *is* running, and the fix is the key, not the process.

### Example

Request: no arguments.

Response (`structuredContent`):

```json
{
  "reachable": true,
  "host": "127.0.0.1",
  "port": 8080,
  "latencyMs": 6,
  "detail": "CapSkip answered at 127.0.0.1:8080 in 6ms."
}
```

When nothing is listening:

```json
{
  "reachable": false,
  "host": "127.0.0.1",
  "port": 8080,
  "detail": "No response from 127.0.0.1:8080 (connect ECONNREFUSED 127.0.0.1:8080). Start the CapSkip desktop app, then confirm its API port matches — override with CAPSKIP_HOST / CAPSKIP_PORT."
}
```

When something else holds the port:

```json
{
  "reachable": false,
  "host": "127.0.0.1",
  "port": 8080,
  "latencyMs": 3,
  "detail": "Something is listening on 127.0.0.1:8080 but it did not answer as CapSkip (HTTP 404). Check the API port in CapSkip settings, and that nothing else has taken that port — override with CAPSKIP_HOST / CAPSKIP_PORT."
}
```

---

## `capskip_solve_image_captcha`

Read the text out of a distorted-text captcha image. Returns the recognized text, which you type into the page's captcha field. Proxies are not supported for image captchas.

### Parameters

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| `image` | string | Yes | — | "The captcha image: a local file path, an http(s) URL, a data: URI, or a raw base64 string." |
| `timeout` | integer | No | `CAPSKIP_TIMEOUT` (120) | "Seconds to wait before giving up. Maximum 600." |

There is no `proxy` field on this tool. Passing one is rejected as an unrecognized key — CapSkip does not support proxying image-captcha solves.

### Output shape

| Field | Type | Description |
|---|---|---|
| `captchaId` | string | CapSkip's internal id for this solve |
| `code` | string | The recognized text |
| `solveSeconds` | number | Wall-clock time the solve took |

### Example

Request:

```json
{
  "image": "https://example.com/captcha.png"
}
```

Response (`structuredContent`):

```json
{
  "captchaId": "48213",
  "code": "8fx3k2",
  "solveSeconds": 4.31
}
```

Text output: `Solved the image captcha in 4.31s.\nText: 8fx3k2\n(CapSkip captcha id 48213)`

---

## `capskip_solve_recaptcha`

Solve a Google reCAPTCHA v2 or v3 widget, including invisible and Enterprise variants. Returns a token to place in the page's `g-recaptcha-response` field before submitting the form. Read the sitekey from the page first — a guessed sitekey fails. Note that reCAPTCHA v3 returns a score assigned by Google; no solver can raise it.

### Parameters

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| `sitekey` | string | Yes | — | "The site key, from the widget's data-sitekey attribute or the grecaptcha config." |
| `url` | string (URL) | Yes | — | "Full URL of the page the captcha appears on, including scheme." |
| `version` | `"v2"` \| `"v3"` | No | `v2` | "Which reCAPTCHA generation the page uses. Defaults to v2." |
| `invisible` | boolean | No | `false` | "v2 only. True when the widget renders with size=invisible." |
| `enterprise` | boolean | No | `false` | "True for reCAPTCHA Enterprise. Works with both v2 and v3." |
| `action` | string | No | — | "v3 only. The action passed to grecaptcha.execute(), e.g. 'login'." |
| `data_s` | string | No | — | "v2 only. The data-s value, used by Google's own services. Rarely needed — CapSkip rejects it on a v3 submit." |
| `proxy` | object | No | — | "Solve through this proxy so the token is issued against its IP." |
| `timeout` | integer | No | `CAPSKIP_RECAPTCHA_TIMEOUT` (300) | "Seconds to wait before giving up. Maximum 600." |

`proxy` shape (shared with `capskip_solve_turnstile`, `capskip_solve_geetest` and `capskip_solve_altcha`):

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | `"HTTP"` \| `"HTTPS"` \| `"SOCKS5"` \| `"SOCKS5H"` | Yes | "Proxy scheme. CapSkip supports only these four." |
| `uri` | string | Yes | "Proxy address as `host:port` or `login:password@host:port`." |

**There is no `min_score` parameter.** CapSkip solves locally and returns whatever score Google assigns — it cannot re-solve to clear a threshold the way a cloud service can, so a `min_score` option would promise control that does not exist. Passing `min_score` is rejected as an unrecognized key (`Unrecognized key: "min_score"`), not silently dropped.

`action` applies only to `version: "v3"`; `invisible` applies only to `version: "v2"` (the default). Supplying either against the wrong version is rejected with a message naming the conflict — `'action' is only supported for reCAPTCHA v3.` and `invisible is only supported for reCAPTCHA v2.` respectively.

### Output shape

| Field | Type | Description |
|---|---|---|
| `captchaId` | string | CapSkip's internal id for this solve |
| `code` | string | The `g-recaptcha-response` token |
| `solveSeconds` | number | Wall-clock time the solve took |

### Example

Request (reCAPTCHA v3):

```json
{
  "sitekey": "6Le-wvkSAAAAAPBMRTvw0Q4Muexq9bi0DJwx_mJ-",
  "url": "https://example.com/login",
  "version": "v3",
  "action": "submit"
}
```

Response (`structuredContent`):

```json
{
  "captchaId": "93841",
  "code": "03AGdBq26f_score0.9token...",
  "solveSeconds": 9.62
}
```

Text output: `Solved reCAPTCHA v3 in 9.62s.\nPut this token in the "g-recaptcha-response" field, then submit the form.\nToken: 03AGdBq26f_score0.9token...\n(CapSkip captcha id 93841)`

---

## `capskip_solve_turnstile`

Solve a Cloudflare Turnstile widget or interstitial challenge page. Returns a token for the page's `cf-turnstile-response` field. IMPORTANT: submit the token using the returned `userAgent` — Cloudflare rejects a token replayed under a different User-Agent. For an interstitial challenge page, also pass `cdata` and `pagedata` read from the page.

### Parameters

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| `sitekey` | string | Yes | — | "The Turnstile site key, from the widget's data-sitekey attribute." |
| `url` | string (URL) | Yes | — | "Full URL of the page the captcha appears on, including scheme." |
| `action` | string | No | — | "The action from data-action or turnstile.render()." |
| `cdata` | string | No | — | "The cData value. Interstitial challenge pages only, not ordinary widgets." |
| `pagedata` | string | No | — | "The chlPageData value. Interstitial challenge pages only." |
| `proxy` | object | No | — | "Solve through this proxy so the token is issued against its IP." |
| `timeout` | integer | No | `CAPSKIP_RECAPTCHA_TIMEOUT` (300) | "Seconds to wait before giving up. Maximum 600." |

`proxy` has the same `{ type, uri }` shape documented under `capskip_solve_recaptcha` above.

### Output shape

| Field | Type | Always present | Description |
|---|---|---|---|
| `captchaId` | string | yes | CapSkip's internal id for this solve |
| `code` | string | yes | The `cf-turnstile-response` token |
| `solveSeconds` | number | yes | Wall-clock time the solve took |
| `userAgent` | string | when CapSkip returns one | User-Agent the token must be submitted with |

### Example

Request:

```json
{
  "sitekey": "0x4AAAAAAA...",
  "url": "https://example.com"
}
```

Response (`structuredContent`):

```json
{
  "captchaId": "77120",
  "code": "0.k9J3n...token",
  "solveSeconds": 6.05,
  "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ..."
}
```

Text output: `Solved Turnstile in 6.05s.\nPut this token in the "cf-turnstile-response" field, then submit the form.\nToken: 0.k9J3n...token\nSend the token with this exact User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ...\n(CapSkip captcha id 77120)`

For a challenge page, add `cdata` and `pagedata` read from the page:

```json
{
  "sitekey": "0x4AAAAAAA...",
  "url": "https://example.com/challenge",
  "action": "managed",
  "cdata": "0=abc123...",
  "pagedata": "3fH...pagedata"
}
```

---

## `capskip_solve_geetest`

Solve a GeeTest v3 slide-puzzle captcha. Returns `geetest_challenge`, `geetest_validate`, and `geetest_seccode` to post back exactly as the site's own front-end would. IMPORTANT: the challenge value is single-use and expires in roughly a minute, so fetch `gt` and `challenge` from the page immediately before calling. A stale challenge is the most common failure.

### Parameters

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| `gt` | string | Yes | — | "The gt value. Static per site, so it can be reused." |
| `challenge` | string | Yes | — | "The challenge value. Single-use and expires in about a minute — fetch a fresh one immediately before calling this." |
| `url` | string (URL) | Yes | — | "Full URL of the page the captcha appears on, including scheme." |
| `api_server` | string | No | — | "A non-default GeeTest API domain, e.g. 'api-na.geetest.com'." |
| `proxy` | object | No | — | "Solve through this proxy so the answer is produced from its IP." |
| `timeout` | integer | No | `CAPSKIP_RECAPTCHA_TIMEOUT` (300) | "Seconds to wait before giving up. Maximum 600." |

`proxy` has the same `{ type, uri }` shape documented under `capskip_solve_recaptcha` above.

### Output shape

| Field | Type | Always present | Description |
|---|---|---|---|
| `captchaId` | string | yes | CapSkip's internal id for this solve |
| `code` | string | yes | The raw JSON string CapSkip returns |
| `solveSeconds` | number | yes | Wall-clock time the solve took |
| `challenge` | string | when parsed from the answer | `geetest_challenge` to post back |
| `validate` | string | when parsed from the answer | `geetest_validate` to post back |
| `seccode` | string | when parsed from the answer | `geetest_seccode` to post back |

### Example

Request:

```json
{
  "gt": "81388ea1fc187e0c335c0a8907ff2625",
  "challenge": "7cf6a8b1a2c34d5e6f7089abcdef0123",
  "url": "https://example.com/login"
}
```

Response (`structuredContent`):

```json
{
  "captchaId": "10432",
  "code": "{\"geetest_challenge\":\"7cf6a8b1...\",\"geetest_validate\":\"a1b2c3...\",\"geetest_seccode\":\"a1b2c3...|jordan\"}",
  "solveSeconds": 14.2,
  "challenge": "7cf6a8b1a2c34d5e6f7089abcdef0123",
  "validate": "a1b2c3d4e5f6...",
  "seccode": "a1b2c3d4e5f6...|jordan"
}
```

Text output: `Solved GeeTest in 14.2s.\nPost these back exactly as the site's own front-end would:\ngeetest_challenge: 7cf6a8b1a2c34d5e6f7089abcdef0123\ngeetest_validate: a1b2c3d4e5f6...\ngeetest_seccode: a1b2c3d4e5f6...|jordan\n(CapSkip captcha id 10432)`

---

## `capskip_solve_altcha`

Solve an ALTCHA proof-of-work challenge. ALTCHA is not a recognition captcha — there is nothing to read; the client brute-forces a number that satisfies a challenge, so a solve is deterministic and takes milliseconds. Give it either `challenge_url` (the endpoint the `<altcha-widget>` fetches from, which CapSkip will fetch) or `challenge_json` (the challenge document itself). Returns a token to put in the page's form field named `altcha`, verbatim. IMPORTANT: challenges expire quickly — some sites inside two minutes — so read the challenge immediately before calling and submit the token promptly. An expired challenge is rejected with a bare "verification failed" that looks exactly like a wrong answer.

### Parameters

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| `url` | string (URL) | Yes | — | "Full URL of the page the captcha appears on, including scheme." |
| `challenge_url` | string | One of the two | — | "The endpoint the ALTCHA widget fetches its challenge from. CapSkip fetches it for you." |
| `challenge_json` | string | One of the two | — | "The challenge document itself, as a JSON string, when you already have it. Solved locally with no network request." |
| `proxy` | object | No | — | "Fetch the challenge through this proxy. Used ONLY for the challenge_url fetch." |
| `timeout` | integer | No | `CAPSKIP_DEFAULT_TIMEOUT` (120) | "Seconds to wait before giving up. Maximum 600." |

Passing neither `challenge_url` nor `challenge_json` returns an error naming what is missing, rather than spending a round trip to learn CapSkip's `ERROR_BAD_PARAMETERS`. Passing both is allowed — the inline document wins.

`proxy` has the same `{ type, uri }` shape documented under `capskip_solve_recaptcha` above.

### Finding the challenge

Open DevTools → Network on the target page and look for the request the `<altcha-widget>` makes for its challenge (often something like `/altcha/challenge`). The request URL is `challenge_url`; its JSON response is `challenge_json`. The widget attribute naming that endpoint depends on the widget version: v1/v2 use `challengeurl="…"`, while v3+ uses `challenge="…"` for both a URL and inline data.

### Output shape

| Field | Type | Always present | Description |
|---|---|---|---|
| `captchaId` | string | yes | CapSkip's internal id for this solve |
| `code` | string | yes | The base64 token — the same string as `token` |
| `solveSeconds` | number | yes | Wall-clock time the solve took |
| `token` | string | yes | The payload to submit in the `altcha` form field |
| `number` | number | when the server reports one | The counter that satisfied the challenge. Present for both the legacy and proof-of-work v2 schemes, whose tokens carry it differently. |

### Example

Request:

```json
{
  "url": "https://example.com/signup",
  "challenge_url": "https://example.com/captcha/api/altcha/challenge"
}
```

Response (`structuredContent`):

```json
{
  "captchaId": "10433",
  "code": "eyJhbGdvcml0aG0iOiJTSEEtMjU2Iiwi...",
  "solveSeconds": 0.27,
  "token": "eyJhbGdvcml0aG0iOiJTSEEtMjU2Iiwi...",
  "number": 9661
}
```

Text output: `Solved ALTCHA in 0.27s.\nSubmit this verbatim in the form field the widget uses, named \`altcha\` — do not re-encode, trim or re-order it, or the server's signature check fails:\naltcha: eyJhbGdvcml0aG0iOiJTSEEtMjU2Iiwi...\n(counter 9661; CapSkip captcha id 10433)`

### Unsupported algorithms

CapSkip solves the legacy scheme (SHA-1/256/384/512) and PoW v2 with PBKDF2 or SHA. **Argon2id and scrypt are refused**, not attempted: the solve returns `ERROR_CAPTCHA_UNSOLVABLE` and is never retried. ALTCHA recommends PBKDF2 as the default, so this affects a minority of sites.

---

## Validation errors

Every tool's schema is a strict object: any key it does not declare is rejected rather than ignored, and every required key must be present. These failures return `isError: true` before the call ever reaches CapSkip. Examples:

| Situation | Message contains |
|---|---|
| Unknown key, e.g. `min_score` on `capskip_solve_recaptcha` | `Unrecognized key: "min_score"` |
| Missing required key, e.g. `image` omitted | `... at image` |
| `timeout` above 600 | `... expected number to be <=600 at timeout` |
| `url` without a scheme | `Invalid URL at url` |
| Unsupported `proxy.type`, e.g. `SOCKS4` | `Invalid option: expected one of "HTTP"\|"HTTPS"\|"SOCKS5"\|"SOCKS5H" at proxy.type` |

The 600-second cap applies only to the `timeout` argument on an individual tool call — it is rejected outright above 600, never silently reduced. `CAPSKIP_TIMEOUT` and `CAPSKIP_RECAPTCHA_TIMEOUT`, which supply the *default* when `timeout` is omitted, are a separate setting validated at startup with their own bound (1–3600 seconds); a default above 600 is accepted and simply is not capped by the per-call schema.

---

## See also

- [Tutorial](TUTORIAL.md) — recognizing each captcha type on a page and placing the answer
- [Getting Started](GETTING_STARTED.md) — installation and client setup
- [Troubleshooting](TROUBLESHOOTING.md) — fixes for common errors
- [CapSkip API docs](https://capskip.com/api-docs/) — the raw HTTP API `capskip-mcp` wraps
