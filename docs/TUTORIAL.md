# CapSkip MCP Server — Complete Tutorial

This tutorial takes you from zero to solving every captcha type CapSkip supports, one page-recognition pattern at a time. Work through it top to bottom, or jump to the section you need.

For each captcha type, four questions in order:

1. **How do I recognize this captcha on a page?**
2. **What do I read off the page?**
3. **What call do I make?**
4. **Where does the answer go?**

**Contents**

1. [Image captcha](#1-image-captcha)
2. [reCAPTCHA v2](#2-recaptcha-v2)
3. [reCAPTCHA v2 Invisible](#3-recaptcha-v2-invisible)
4. [reCAPTCHA v2 Enterprise](#4-recaptcha-v2-enterprise)
5. [reCAPTCHA v3](#5-recaptcha-v3)
6. [Turnstile widget](#6-turnstile-widget)
7. [Turnstile challenge page](#7-turnstile-challenge-page)
8. [GeeTest v3](#8-geetest-v3)
9. [ALTCHA](#9-altcha)
10. [Using a proxy](#10-using-a-proxy)

---

## 1. Image captcha

### How do I recognize this captcha on a page?

A plain `<img>` element showing distorted, wavy, or noisy text, almost always sitting next to a text input for the answer. There is no JavaScript widget, no sitekey, and no site-key attribute to find — the whole captcha is the image.

### What do I read off the page?

The image itself — its `src` URL, or the raw bytes if it is served inline. Nothing else is needed; there is no sitekey or page URL requirement for this tool.

### What call do I make?

```json
{
  "image": "https://example.com/captcha.png"
}
```

`image` also accepts a local file path, a `data:` URI, or a raw base64 string — the tool auto-detects which form was passed.

### Where does the answer go?

`code` is the recognized text. Type it into the adjacent text input and submit the form.

---

## 2. reCAPTCHA v2

### How do I recognize this captcha on a page?

The classic "I'm not a robot" checkbox: a `<div class="g-recaptcha" data-sitekey="...">`, or a call to `grecaptcha.render(container, { sitekey: '...' })` in the page's scripts. The widget iframe's `src` also carries the sitekey and `size` query parameters.

### What do I read off the page?

The `data-sitekey` attribute (or the `sitekey` field of the JS config object), and the full URL of the page the widget is on.

### What call do I make?

```json
{
  "sitekey": "6Le-wvkSAAAAAPBMRTvw0Q4Muexq9bi0DJwx_mJ-",
  "url": "https://example.com/login"
}
```

`version` defaults to `v2`, so it can be omitted for a standard checkbox widget.

### Where does the answer go?

`code` is the `g-recaptcha-response` token. reCAPTCHA's own widget normally creates a hidden `textarea` with that `name` for you to populate — set its value to `code`, then submit the form (or invoke the page's `data-callback`, if it uses one, with the token).

---

## 3. reCAPTCHA v2 Invisible

### How do I recognize this captcha on a page?

No visible checkbox. Instead, `data-size="invisible"` on the `.g-recaptcha` div, `grecaptcha.render(..., { size: 'invisible' })` in script, or `size=invisible` in the widget iframe's `src` URL. The captcha typically fires when a form is submitted or a button is clicked, rather than presenting anything to click beforehand.

### What do I read off the page?

The same `data-sitekey` as a standard v2 widget, plus the fact that it is invisible.

### What call do I make?

```json
{
  "sitekey": "6Le-wvkSAAAAAPBMRTvw0Q4Muexq9bi0DJwx_mJ-",
  "url": "https://example.com/login",
  "invisible": true
}
```

### Where does the answer go?

Same as standard v2 — `code` goes in the `g-recaptcha-response` field. Because invisible widgets are usually wired to a `data-callback`, you may also need to invoke that callback with the token to unblock the page's own submit logic.

---

## 4. reCAPTCHA v2 Enterprise

### How do I recognize this captcha on a page?

The page loads `https://www.google.com/recaptcha/enterprise.js` instead of the standard `api.js`, or calls `grecaptcha.enterprise.render(...)`. The loader script URL is the reliable signal — sitekey formatting alone does not distinguish Enterprise from standard reCAPTCHA.

### What do I read off the page?

The `data-sitekey` as usual, and the fact that it is served via the Enterprise loader.

### What call do I make?

```json
{
  "sitekey": "6Le-wvkSAAAAAPBMRTvw0Q4Muexq9bi0DJwx_mJ-",
  "url": "https://example.com/login",
  "enterprise": true
}
```

`enterprise` works with either `version`, so it also applies to Enterprise v3 (Section 5).

### Where does the answer go?

Same as the non-Enterprise variant of whichever version you set — `g-recaptcha-response` for v2 Enterprise, or wherever the page's own JS reads the resolved token for v3 Enterprise.

---

## 5. reCAPTCHA v3

### How do I recognize this captcha on a page?

No visible widget at all — at most a small badge in a page corner reading "protected by reCAPTCHA". Look in the page's scripts for `<script src=".../api.js?render=SITEKEY">` and a call to `grecaptcha.execute(sitekey, { action: '...' })`.

### What do I read off the page?

The sitekey from the `render=` query parameter (or the first argument to `grecaptcha.execute`), and the exact `action` string passed as `grecaptcha.execute`'s second argument — it must match what the call site sends.

### What call do I make?

```json
{
  "sitekey": "6Le-wvkSAAAAAPBMRTvw0Q4Muexq9bi0DJwx_mJ-",
  "url": "https://example.com/login",
  "version": "v3",
  "action": "submit"
}
```

### Where does the answer go?

v3 has no fixed field name the way v2 does. The page's own JavaScript normally calls `grecaptcha.execute(...).then(token => ...)` and does something specific with the result — sets a hidden input, or sends it via `fetch`/XHR. Read what the page does with its own resolved token and do the same with `code`.

Because the score behind this token is assigned entirely by Google from signals CapSkip cannot see, there is no `min_score` parameter to request a higher one — see [Using a proxy](#9-using-a-proxy) below and [Troubleshooting](TROUBLESHOOTING.md#recaptcha-v3-accepted-but-the-site-still-blocks) if a v3 token is accepted but the site still treats the request as suspicious.

---

## 6. Turnstile widget

### How do I recognize this captcha on a page?

An element with class `cf-turnstile` and a `data-sitekey` attribute, or a call to `turnstile.render(container, { sitekey })`. Rendered inline in a form, usually as a small "Verify you are human" checkbox or spinner.

### What do I read off the page?

`data-sitekey`, the page URL, and `data-action` if the page sets one.

### What call do I make?

```json
{
  "sitekey": "0x4AAAAAAA...",
  "url": "https://example.com"
}
```

### Where does the answer go?

`code` goes in a hidden input named `cf-turnstile-response` (Turnstile creates this for you inside the widget). **Submit it with the returned `userAgent` as the request's User-Agent** — Cloudflare binds the token to the solving User-Agent and rejects a mismatch.

---

## 7. Turnstile challenge page

### How do I recognize this captcha on a page?

A full-page Cloudflare interstitial — "Checking your browser...", "Verifying you are human..." — served instead of the page you requested, rather than a widget embedded in a form you're filling out.

### What do I read off the page?

The sitekey as usual, plus `cData` and `chlPageData` values embedded in the page's inline script or a JSON config blob (field names and exact location vary by Cloudflare's challenge version — search the page source for `cData` and `chlPageData`).

### What call do I make?

```json
{
  "sitekey": "0x4AAAAAAA...",
  "url": "https://example.com/challenge",
  "action": "managed",
  "cdata": "0=abc123...",
  "pagedata": "3fH...pagedata"
}
```

### Where does the answer go?

Same `cf-turnstile-response` field as the widget case, submitted with the returned `userAgent`. Challenge pages are checked at least as strictly as embedded widgets — a mismatched User-Agent here is the most common way a correct-looking token still gets rejected.

---

## 8. GeeTest v3

### How do I recognize this captcha on a page?

A slide-puzzle widget, typically inside a container whose id or class mentions "geetest", or a call to `initGeetest({ gt, challenge, ... }, callback)` in the page's scripts.

### What do I read off the page?

Unlike a sitekey, `gt` and `challenge` are not static page attributes — the page itself fetches them from an endpoint (often something like `.../register.php` or a `gettype`/`get.php` request) that returns `{"gt": "...", "challenge": "..."}`. Find that request in DevTools → Network, or read the values out of the `initGeetest({ gt, challenge })` call after the page has run it.

**`gt` and `challenge` must be fetched immediately before solving.** `gt` is static per site and can be reused, but `challenge` is single-use and expires in about a minute — a value copied earlier or cached is already dead by the time you call the tool.

### What call do I make?

```json
{
  "gt": "81388ea1fc187e0c335c0a8907ff2625",
  "challenge": "7cf6a8b1a2c34d5e6f7089abcdef0123",
  "url": "https://example.com/login"
}
```

If the site loads GeeTest from a non-default domain, add `api_server`, e.g. `"api-na.geetest.com"`.

### Where does the answer go?

A three-field post-back: `challenge`, `validate`, and `seccode` from the response map to `geetest_challenge`, `geetest_validate`, and `geetest_seccode` respectively, submitted under those exact names exactly as the site's own front-end would. Sending only `validate` is the most common reason an otherwise-correct solve is rejected — all three fields are required.

---

## 9. ALTCHA

### How do I recognize this captcha on a page?

An `<altcha-widget>` element, or a checkbox-style control whose container mentions "altcha". Unlike the others there is no sitekey: the widget names a challenge source instead. Read the page source rather than assuming which attribute — v1/v2 widgets use `challengeurl="…"` (with `challengejson="…"` for an inline challenge), while v3+ uses a single `challenge="…"` that takes either a URL or the challenge data.

Some deployments generate the challenge in-page and fetch nothing at all. In that case there is no network request to watch — read the challenge out of the widget.

### What do I pass to the tool?

`url`, plus **one** of:

- `challenge_url` — the endpoint the widget fetches from; CapSkip fetches it for you
- `challenge_json` — the challenge document itself, as a JSON string; solved locally with no network request

```json
{
  "url": "https://example.com/signup",
  "challenge_url": "https://example.com/captcha/api/altcha/challenge"
}
```

Find the endpoint in DevTools → Network: it is the request the widget makes for its challenge, often something like `/altcha/challenge`. Its JSON response is what `challenge_json` would carry.

> **Challenges expire, and the window is short** — some sites inside two minutes. Fetch one immediately before solving and submit the token promptly. An expired challenge is rejected with a bare "verification failed" that looks exactly like a wrong answer, which sends people hunting for a solver bug that is not there.

### Where does the answer go?

A single field. Submit `token` under the name `altcha`, exactly as the widget would:

```
email=someone%40example.com&altcha=eyJhbGdvcml0aG0iOiJTSEEtMjU2Iiwi...
```

Do not re-encode, trim or re-order it: the token is base64 of a JSON document whose fields are covered by the server's HMAC signature, so any modification invalidates it. Some integrations read the payload from a JSON body field instead — check what the page's own submit sends and mirror it.

---

## 10. Using a proxy

Solving through the same IP you will submit from generally improves acceptance for reCAPTCHA, Turnstile, and GeeTest. All three tools accept an optional `proxy` object, as does `capskip_solve_altcha` — though there it applies only to the challenge fetch, never to the solve itself:

```json
{
  "sitekey": "6Le-wvkSAAAAAPBMRTvw0Q4Muexq9bi0DJwx_mJ-",
  "url": "https://example.com/login",
  "proxy": { "type": "HTTPS", "uri": "user:pass@1.2.3.4:3128" }
}
```

```json
{
  "sitekey": "0x4AAAAAAA...",
  "url": "https://example.com",
  "proxy": { "type": "HTTP", "uri": "1.2.3.4:3128" }
}
```

```json
{
  "gt": "81388ea1fc187e0c335c0a8907ff2625",
  "challenge": "7cf6a8b1a2c34d5e6f7089abcdef0123",
  "url": "https://example.com/login",
  "proxy": { "type": "SOCKS5", "uri": "1.2.3.4:1080" }
}
```

`type` must be one of `HTTP`, `HTTPS`, `SOCKS5`, or `SOCKS5H` — CapSkip maps only these four, and anything else (including `SOCKS4`) is rejected. `uri` may be a bare `host:port` or carry credentials as `login:password@host:port`.

**`capskip_solve_image_captcha` does not accept a `proxy` argument.** CapSkip does not support proxying image-captcha solves, and passing one is rejected as an unrecognized key rather than silently ignored.

---

### Where to go next

- [API Reference](API_REFERENCE.md) — every tool, parameter, and return shape
- [Getting Started](GETTING_STARTED.md) — installation and client setup
- [Troubleshooting](TROUBLESHOOTING.md) — fixes for common errors
