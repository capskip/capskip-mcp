# CapSkip MCP Server — API Reference

Complete reference for all twelve tools `capskip-mcp` registers. Parameter descriptions below are copied verbatim from each tool's schema in `src/tools/` so this document cannot drift from what a client actually sees when it lists tools.

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
| `capskip_solve_capy` | Solve a Capy Puzzle captcha | Yes (puzzle-image fetch only) |
| `capskip_solve_captchafox` | Solve a CaptchaFox challenge | Yes |
| `capskip_solve_friendly_captcha` | Solve a Friendly Captcha proof-of-work challenge | Yes |
| `capskip_solve_amazon_waf` | Solve an AWS WAF (Amazon WAF) CAPTCHA | Yes |
| `capskip_solve_datadome` | Pass a DataDome challenge and get its cookie | Yes |
| `capskip_solve_hcaptcha` | Solve an hCaptcha widget (checkbox, invisible, Enterprise) | Yes |

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

`proxy` shape (shared with every solve tool except `capskip_solve_image_captcha`):

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

## `capskip_solve_capy`

Solve a Capy Puzzle captcha — a slide puzzle where a piece is dragged into a hole cut out of a photograph. IMPORTANT: unlike every other captcha tool here, the answer is NOT a single token. It is three values — `captchakey`, `challengekey` and `answer` — which all go into the target form, in fields named `capy_captchakey`, `capy_challengekey` and `capy_answer`. Submit the answer verbatim: it is the drag path the widget would have recorded, so trimming or re-encoding it invalidates the solve. The challenge key is single-use and short-lived, so submit promptly rather than caching the three values.

### Parameters

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| `sitekey` | string | Yes | — | "The site's public Capy key, conventionally prefixed 'PUZZLE_'." |
| `url` | string (URL) | Yes | — | "Full URL of the page the captcha appears on, including scheme." |
| `api_server` | string | No | `https://jp.api.capy.me` | "The root of the Capy API the key lives behind, taken from the widget script URL." |
| `proxy` | object | No | — | "Draw the puzzle image through this proxy. That fetch is the only request a Capy solve makes." |
| `timeout` | integer | No | `CAPSKIP_TIMEOUT` (120) | "Seconds to wait before giving up. Maximum 600." |

`proxy` has the same `{ type, uri }` shape documented under `capskip_solve_recaptcha` above.

> `api.capy.me` no longer resolves, although several solver services still document it. The live host is `jp.api.capy.me`; if a site's widget points somewhere else, pass that as `api_server`.

### Finding the captcha key

It is in the page source as `capy_captchakey`, or in the widget script URL: `<script src="https://jp.api.capy.me/puzzle/get_js/?k=PUZZLE_XXXX">`.

### Output shape

| Field | Type | Always present | Description |
|---|---|---|---|
| `captchaId` | string | yes | CapSkip's internal id for this solve |
| `code` | string | yes | The raw answer object, as a JSON string |
| `solveSeconds` | number | yes | Wall-clock time the solve took |
| `captchakey` | string | when the answer parsed | The value for the form's `capy_captchakey` field |
| `challengekey` | string | when the answer parsed | The value for the form's `capy_challengekey` field. Single-use. |
| `answer` | string | when the answer parsed | The value for the form's `capy_answer` field — the drag path |
| `respKey` | string | when the answer parsed | Empty for a puzzle solve; present only for shape compatibility |

### Example

Request:

```json
{
  "sitekey": "PUZZLE_Abc1dEFghIJKLM2no34P56q7rStu8v",
  "url": "https://example.com/login"
}
```

Response (`structuredContent`):

```json
{
  "captchaId": "10433",
  "code": "{\"captchakey\":\"PUZZLE_Abc1dEFghIJKLM2no34P56q7rStu8v\",\"challengekey\":\"BalY2gJaI8uA2SGVOZhqBQ3V0CYSNNGP\",\"answer\":\"0xax8ex0xax84x...\",\"respKey\":\"\"}",
  "solveSeconds": 2.14,
  "captchakey": "PUZZLE_Abc1dEFghIJKLM2no34P56q7rStu8v",
  "challengekey": "BalY2gJaI8uA2SGVOZhqBQ3V0CYSNNGP",
  "answer": "0xax8ex0xax84x0xkx7qx0x18x76x...",
  "respKey": ""
}
```

### Why a solve takes about two seconds

Capy grades the wall-clock gap between issuing the puzzle and verifying the answer, and refuses anything superhuman with `CAPTCHA verification failed` — the same message a wrong answer gets. CapSkip therefore holds every result until two seconds have elapsed since it drew the puzzle. The detection itself takes about a tenth of a second; the rest is a deliberate wait. Nothing to configure.

---

## `capskip_solve_captchafox`

Solve a CaptchaFox challenge. CaptchaFox scores the browser itself rather than asking the visitor to read anything, so most solves draw no puzzle at all. Returns a token to put in the form field named `cf-captcha-response`, verbatim — it is verified server side against the session that produced it, so any edit invalidates it.

### Parameters

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| `sitekey` | string | Yes | — | "The public key the widget renders with, conventionally prefixed 'sk_'." |
| `url` | string (URL) | Yes | — | "Full URL of the page the captcha appears on, including scheme." |
| `api_server` | string | No | `https://cdn.captchafox.com/` | "The widget entry point the target page loads." |
| `proxy` | object | No | — | "Solve from this network." |
| `timeout` | integer | No | `CAPSKIP_RECAPTCHA_TIMEOUT` (300) | "Seconds to wait before giving up. Maximum 600." |

### The page URL has to match the key

CaptchaFox keys are registered against a list of allowed domains and the service checks the host before it issues anything. A key that is correct but used on a page outside that list is refused permanently, not intermittently — so a sitekey that fails immediately and consistently usually means the wrong page URL, not a bad key. CapSkip reports that case rather than retrying it, because retrying cannot help.

### Choosing the widget source

| `api_server` | Token | Default |
|---|---|---|
| `https://cdn.captchafox.com/` | Plain | Yes |
| `https://s.uicdn.com/mampkg/…` | `MAM_` prefixed | No |

Read the value from the `<script>` tag that loads the widget. Sending the wrong one still succeeds, but returns a token in a format the target site will not accept — a silent verification failure rather than an error.

### Challenge types

| Challenge | Frequency | Supported |
|---|---|---|
| Invisible | Usually | Yes |
| Slide | Sometimes | Yes |
| Image select | Rarely | No |
| Audio | Rarely | No |

The two unsupported ones are uncommon and a retry usually draws a different challenge, so treat an unsolvable result as a signal to resubmit rather than a permanent failure of the key.

### Output shape

| Field | Type | Always present | Description |
|---|---|---|---|
| `captchaId` | string | yes | CapSkip's internal id for this solve |
| `code` | string | yes | The token — the same string as `token` |
| `solveSeconds` | number | yes | Wall-clock time the solve took |
| `token` | string | yes | The value to submit in the `cf-captcha-response` field |
| `userAgent` | string | when the solve reported one | The UA the token was minted under — the browser's own, not one you sent |

### Example

Request:

```json
{
  "sitekey": "sk_xtNxpk6fCdFbxh1_xJeGflSdCE9tn99G",
  "url": "https://example.com/signup"
}
```

Response (`structuredContent`):

```json
{
  "captchaId": "10434",
  "code": "177f50c25b845601e5c779cdb51b040d...",
  "solveSeconds": 6.31,
  "token": "177f50c25b845601e5c779cdb51b040d...",
  "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ... Chrome/146.0.0.0 Safari/537.36"
}
```

Submit the token under the reported `userAgent`, not your own: CapSkip solves in a real browser and the token is bound to that browser's identity.

---

## `capskip_solve_friendly_captcha`

Solve a Friendly Captcha proof-of-work challenge. Nothing is shown on screen — the widget does arithmetic instead of asking the visitor to do anything.

### Parameters

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| `sitekey` | string | Yes | — | "The data-sitekey attribute of the widget element — the one carrying class='frc-captcha'." |
| `url` | string (URL) | Yes | — | "Full URL of the page the captcha appears on, including scheme." |
| `version` | `"v1"` \| `"v2"` | No | `v1` | "The protocol version the site uses. Send this or module_script." |
| `module_script` | string | No | — | "The src of the widget script tag carrying type='module'." |
| `nomodule_script` | string | No | — | "The src of the widget script tag carrying 'nomodule'." |
| `api_server` | string | No | `global` | "The data-residency tenant the sitekey belongs to: 'global', 'eu', or a full URL." |
| `proxy` | object | No | — | "Solve from this network." |
| `timeout` | integer | No | `CAPSKIP_RECAPTCHA_TIMEOUT` (300) | "Seconds to wait before giving up. Maximum 600." |

### Version 1 and version 2

Two entirely different protocols ship under this one name, sharing a brand and a sitekey namespace and nothing else, and a sitekey does not tell you which a site uses. Both are live. Solve the wrong one and you get a well-formed token the target site rejects, with no indication that the version was the problem.

| `version` | Widget package | Script | Form field |
|---|---|---|---|
| `v1` | `friendly-challenge` | `widget.module.min.js` / `widget.min.js` | `frc-captcha-solution` |
| `v2` | `@friendlycaptcha/sdk` | `site.min.js` | `frc-captcha-response` |

CapSkip decides in this order, stopping at the first answer: the `version` parameter; then the script URL from `module_script` or `nomodule_script`, which is the most reliable signal because it is the build the site actually loads; then v1. The tool's text reply names the form field matching the version that was actually solved, so an agent does not have to work it out.

A `version` outside `v1`/`v2` is refused by the schema before the call reaches CapSkip.

### Output shape

| Field | Type | Always present | Description |
|---|---|---|---|
| `captchaId` | string | yes | CapSkip's internal id for this solve |
| `code` | string | yes | The token — the same string as `token` |
| `solveSeconds` | number | yes | Wall-clock time the solve took |
| `token` | string | yes | The value to submit, in `frc-captcha-solution` (v1) or `frc-captcha-response` (v2) |

### Example

Request:

```json
{
  "sitekey": "FCMGEMUD2M567T8G",
  "url": "https://example.com/signup",
  "version": "v2"
}
```

Response (`structuredContent`):

```json
{
  "captchaId": "10435",
  "code": "AQQA.vW7kd3CujKT8PaQgEcW18QaH...",
  "solveSeconds": 18.4,
  "token": "AQQA.vW7kd3CujKT8PaQgEcW18QaH..."
}
```

### Token sizes differ sharply between versions

A v1 token is four dot-separated parts and runs to a few hundred characters. A v2 token is a single opaque string beginning `AQQA.` and is roughly six kilobytes, so make sure whatever carries it — a hidden field, a database column, a proxied request — is sized for that.

### Solve time is not a constant

The service decides how much work a request is worth at the moment it is made, and raises that figure for addresses it has already seen a lot of: the published range between a fresh address and a heavily used one is close to thirty times the work for the same token. Budget for that in your timeout rather than assuming a fixed duration, and use a proxy pool past casual volume.

---

## `capskip_solve_amazon_waf`

Solve an AWS WAF (Amazon WAF) CAPTCHA — the image-grid or toy-car puzzle Amazon's firewall shows on a 405 challenge page (`window.gokuProps` plus challenge.js/captcha.js from an awswaf.com host) or in a JS-API widget (jsapi.js plus `AwsWafCaptcha.renderCaptcha`). Only `sitekey` and `url` are required. IMPORTANT: the answer is NOT the cookie. It is a pair, `captcha_voucher` and `existing_token`, which only work together: POST them as JSON to the `voucher` endpoint in the same folder as the page's challenge.js, and the response's `token` field is the `aws-waf-token`. Send that as the `aws-waf-token` cookie on the protected domain (some widget pages use an `x-aws-waf-token` header instead) and repeat the request.

### Parameters

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| `sitekey` | string | Yes | — | "On a challenge page, the gokuProps.key value — a long key usually starting 'AQIDAH'. On a widget page, the apiKey passed to renderCaptcha — a long key ending in a short suffix such as '_0_1'." |
| `url` | string (URL) | Yes | — | "Full URL of the page the captcha appears on, including scheme." |
| `iv` | string | No | read from the page | "gokuProps.iv from a challenge page. Send it together with context, or leave both out." |
| `context` | string | No | read from the page | "gokuProps.context from a challenge page. Send it together with iv, or leave both out." |
| `challenge_script` | string (URL) | No | read from the page | "The full https URL of the page's challenge.js." |
| `captcha_script` | string (URL) | No | read from the page | "The full https URL of the page's captcha.js." |
| `jsapiScript` | string (URL) | No | — | "The full https URL of the page's jsapi.js (widget pages only)." |
| `proxy` | object | No | — | "Solve through this proxy." |
| `timeout` | integer | No | `CAPSKIP_RECAPTCHA_TIMEOUT` (300) | "Seconds to wait before giving up. Maximum 600." |

`proxy` has the same `{ type, uri }` shape documented under `capskip_solve_recaptcha` above.

Refused before anything reaches CapSkip: `iv` without `context` (or the other way round), and any script URL that is not https on an awswaf.com host ending in challenge.js, captcha.js or jsapi.js — CapSkip POSTs the answer to the host those scripts name, so it accepts no other.

### Finding the values

- **Challenge page.** Keep the body of the HTTP 405 response. `window.gokuProps` holds `key` (send it as `sitekey`), `iv` and `context`; the two `<script>` tags give `challenge_script` and `captcha_script`. Anything you leave out is read from `url` at solve time, which is the safer choice when your copy of the page is more than a few minutes old.
- **Widget page.** Look for the jsapi.js script and the `AwsWafCaptcha.renderCaptcha(..., { apiKey })` call. Send the `apiKey` as `sitekey` and the jsapi.js URL as `jsapiScript`, with no `iv` or `context`.

### Output shape

| Field | Type | Always present | Description |
|---|---|---|---|
| `captchaId` | string | yes | CapSkip's internal id for this solve |
| `code` | string | yes | The raw answer object, as a JSON string |
| `solveSeconds` | number | yes | Wall-clock time the solve took |
| `captcha_voucher` | string | when the answer parsed | AWS WAF's proof the puzzle was answered |
| `existing_token` | string | when the answer parsed | The token the voucher was issued for |

### Example

Request:

```json
{
  "sitekey": "AQIDAHjcYuEXAMPLEghicBgQ/7bFaQZ+m5FKCMDnO+vTbNg96AHDh0IR5vgzHNceHYqZR+GOAAAAfjB8",
  "url": "https://www.example.com/",
  "iv": "CgAFRDIjfgAAA5yY",
  "context": "Rbp3r8fvbuhmrCqpUe8Mh1TLvs8OSKJZiSs2vCF4dt9rxVZI7xYJa2n5k/9r+XaXe7KUIu2I8nXTDHHkDvIOTDc2",
  "challenge_script": "https://3f2a9c7d41b0.edge.sdk.awswaf.com/3f2a9c7d41b0/8e51d0c7a2f4/challenge.js"
}
```

Response (`structuredContent`):

```json
{
  "captchaId": "10571",
  "code": "{\"captcha_voucher\":\"eyJ2b3VjaGVyIjoiRVhBTVBMRSJ9.9QwZcEXAMPLEvoucherJk4LmN0pQ\",\"existing_token\":\"7d4c2a91-EXAMPLE-4f0b-9e6d-3a1b5c8e2f70:EQoAeXAMPLEtokenAAAA:Wm9wc2E=\"}",
  "solveSeconds": 8.31,
  "captcha_voucher": "eyJ2b3VjaGVyIjoiRVhBTVBMRSJ9.9QwZcEXAMPLEvoucherJk4LmN0pQ",
  "existing_token": "7d4c2a91-EXAMPLE-4f0b-9e6d-3a1b5c8e2f70:EQoAeXAMPLEtokenAAAA:Wm9wc2E="
}
```

### Turning the pair into the cookie

```
POST https://3f2a9c7d41b0.edge.sdk.awswaf.com/3f2a9c7d41b0/8e51d0c7a2f4/voucher
Content-Type: text/plain;charset=UTF-8

{"captcha_voucher":"…","existing_token":"…"}
```

The response is a JSON object whose `token` field is the `aws-waf-token`. It stays valid for the site's immunity time, five minutes by default; when the challenge comes back, solve again.


---

## `capskip_solve_datadome`

Pass a DataDome challenge — the block page (HTTP 403, sometimes 401) a DataDome-protected site returns instead of its content, with a slider (`/captcha/`) or a device check (`/interstitial/`) loaded from geo.captcha-delivery.com — and get the `datadome` cookie. Requires `captcha_url` and `url`. IMPORTANT: the cookie belongs to ONE IP address and ONE User-Agent. Repeat the request with the returned `cookie` as the Cookie header, the returned `userAgent` as the User-Agent, and from the same IP: through the proxy you passed, or — when the result carries `proxy` — through that proxy, which CapSkip picked from its own DataDome proxy list because you passed none.

### Parameters

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| `captcha_url` | string | Yes | — | "The address of the DataDome challenge iframe on geo.captcha-delivery.com: /captcha/ for a slider, /interstitial/ for a device check." Take the iframe's `src`, or build it from the block page's `var dd` object (see below). |
| `url` | string (URL) | Yes | — | "Full URL of the page that returned the DataDome block page." |
| `userAgent` | string | No | CapSkip's browser's | "The User-Agent the cookie will be used with. It must be stock Chrome for Windows with the same major version as the browser CapSkip solves with." Usually leave it out. |
| `proxy` | object | No | — | "The proxy the requests carrying the cookie will go through." |
| `timeout` | integer | No | `CAPSKIP_RECAPTCHA_TIMEOUT` (300) | "Seconds to wait before giving up. Maximum 600." |

`proxy` has the same `{ type, uri }` shape documented under `capskip_solve_recaptcha` above.

Refused before anything reaches CapSkip: a `captcha_url` that is not https on captcha-delivery.com under `/captcha/` or `/interstitial/` carrying `initialCid`, `hash` and `cid`; a block page with `t=bv`, which means the requesting address is banned (change it and fetch the page again); a `url` on captcha-delivery.com; and a `userAgent` that is not stock Chrome for Windows. CapSkip itself refuses a different Chrome major version with `ERROR_WRONG_USERAGENT`.

### Building `captcha_url`

Most block pages build the iframe with a script from a `var dd={...}` object. Take the path from `rt` (`i` → `/interstitial/`, otherwise `/captcha/`) and the query from the other fields, every value URL-encoded:

| Query parameter | Value |
|---|---|
| `initialCid` | `dd.cid` |
| `hash` | `dd.hsh` |
| `cid` | `dd.cookie` |
| `t` | `dd.t`, when present |
| `referer` | the page URL you requested |
| `s` | `dd.s` |
| `e` | `dd.e`, when present |
| `b` | `dd.b`, when present |
| `dm` | always `cd` |

The host is `dd.host`, or `geo.captcha-delivery.com`. Each block page is a fresh challenge: solve it soon, and fetch the page again for the next one.

### The proxy CapSkip picks

The CapSkip app can hold a DataDome proxy list of its own (Settings, Captcha types, DataDome, Configure Proxies). A solve sent without `proxy` goes through that list when it has entries, and the result then names the proxy as `host:port`, without its login. The cookie works only from that address, so send the follow-up request through it. A `proxy` passed with the solve always takes priority, and then no `proxy` comes back.

### Output shape

| Field | Type | Always present | Description |
|---|---|---|---|
| `captchaId` | string | yes | CapSkip's internal id for this solve |
| `code` | string | yes | The cookie exactly as DataDome set it, attributes included |
| `solveSeconds` | number | yes | Wall-clock time the solve took |
| `cookie` | string | yes | The `datadome=...` pair alone, for a Cookie header |
| `userAgent` | string | when reported | The User-Agent the cookie was earned with |
| `proxy` | string | only when CapSkip chose it | The DataDome-list proxy the solve went through, `host:port` |

### Example

Request:

```json
{
  "captcha_url": "https://geo.captcha-delivery.com/captcha/?initialCid=AHrlqAAAAAMA7KBvCr0n4cEAG330MA%3D%3D&hash=D013AA612AB2224D03B2318D0F5B19&cid=KzE6_pZBBTHdCdvZkauT9VAshi0wS7~v5_M_MacEtdw8&t=fe&referer=https%3A%2F%2Fwww.example.com%2F&s=45225&e=549255a0289eaf17af60822309ab8db4&dm=cd",
  "url": "https://www.example.com/"
}
```

Response (`structuredContent`):

```json
{
  "captchaId": "10572",
  "code": "datadome=FAPPpli4jkT1MZGtgF8ez7mjSz8MrJ9fGRNE51Gj79cq9fXp5xn~F1P5APWjqvJojf4U9dq0R81Xaj2hpYtjle95mkg; Max-Age=31536000; Domain=.example.com; Path=/; Secure; SameSite=Lax",
  "solveSeconds": 8.42,
  "cookie": "datadome=FAPPpli4jkT1MZGtgF8ez7mjSz8MrJ9fGRNE51Gj79cq9fXp5xn~F1P5APWjqvJojf4U9dq0R81Xaj2hpYtjle95mkg",
  "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36",
  "proxy": "203.0.113.10:8080"
}
```
---

## `capskip_solve_hcaptcha`

Solve an hCaptcha widget — `<div class="h-captcha" data-sitekey="…">` or a js.hcaptcha.com script on the page — and get its token. Checkbox, invisible and hCaptcha Enterprise widgets all use this tool. Requires `sitekey` and `url`. Put the returned token in the form's hidden `h-captcha-response` field and in `g-recaptcha-response` if the form has one, or call the widget's `data-callback` with it, then submit with the returned User-Agent. Tokens are single use and expire about two minutes after they are issued.

### Parameters

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| `sitekey` | string | Yes | — | "The sitekey of the hCaptcha widget, a UUID such as 'a5f74b19-9e45-40e0-b45d-47ff91b7a6c2'. Read it from data-sitekey on the widget container, from the sitekey option of hcaptcha.render(), or from the sitekey= parameter in the address of the hCaptcha iframe." |
| `url` | string (URL) | Yes | — | "Full URL of the page the captcha appears on, including scheme." |
| `invisible` | boolean | No | `false` | "true for an invisible widget, one rendered with data-size=invisible." |
| `data` | string | No | — | "hCaptcha Enterprise only: the rqdata value the page passes to the widget through hcaptcha.setData() before it runs. It is issued for one challenge and expires quickly, so read a fresh one for every solve." |
| `userAgent` | string | No | CapSkip's browser's | "The User-Agent the form will be submitted with. CapSkip uses it only when it matches the browser it solves with, and always reports the one the token was actually earned with." Usually leave it out. |
| `proxy` | object | No | — | "Solve from this network. hCaptcha scores the address a token comes from as well as the browser." |
| `timeout` | integer | No | `CAPSKIP_RECAPTCHA_TIMEOUT` (300) | "Seconds to wait before giving up. Maximum 600." |

`proxy` has the same `{ type, uri }` shape documented under `capskip_solve_recaptcha` above.

The CapSkip app can also hold an hCaptcha proxy pool of its own (Settings, Captcha types, hCaptcha, Configure Proxies); a `proxy` passed with the solve always takes priority over it. If a strict site refuses the tokens that came back, turn on High score mode for hCaptcha on the same settings page.

### Output shape

| Field | Type | Always present | Description |
|---|---|---|---|
| `captchaId` | string | yes | CapSkip's internal id for this solve |
| `code` | string | yes | The token |
| `solveSeconds` | number | yes | Wall-clock time the solve took |
| `token` | string | yes | The same token, for `h-captcha-response` (and `g-recaptcha-response`) |
| `respKey` | string | yes | The second value hCaptcha hands the widget; most sites never read it, and it can be empty |
| `userAgent` | string | when reported | The User-Agent the token was earned with |

### Example

Request:

```json
{
  "sitekey": "a5f74b19-9e45-40e0-b45d-47ff91b7a6c2",
  "url": "https://accounts.hcaptcha.com/demo"
}
```

Response (`structuredContent`):

```json
{
  "captchaId": "10573",
  "code": "P1_eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.hadwYXNza2V5xQZ2...f3Kq8nV2",
  "solveSeconds": 24.6,
  "token": "P1_eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.hadwYXNza2V5xQZ2...f3Kq8nV2",
  "respKey": "E0_eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpZCI6IjA0...9wB1",
  "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36"
}
```

A sitekey hCaptcha refuses for that page fails with `ERROR_RECAPTCHA_INVALID_SITEKEY`; check the `sitekey`, and that `url` is the page the widget is actually on.

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
