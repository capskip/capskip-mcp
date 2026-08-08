# Troubleshooting

Common issues when running `capskip-mcp` and how to fix them.

---

## Client shows the server as failed to start

**Symptom:** Claude Desktop / Claude Code / Cursor / VS Code lists `capskip` as errored, crashed, or disconnected, with no useful detail in the UI.

**Cause:** Usually one of: Node.js is missing or too old, `npx` cannot reach the registry, or a config error (bad flag, bad env value) makes the process exit immediately.

**Fix**

1. Confirm Node 18+:

```bash
node --version
```

2. Run the server by hand and read stderr directly — this is the fastest way to see the real failure, since MCP clients often swallow it:

```bash
npx -y capskip-mcp
```

A healthy start prints one line to stderr and then waits:

```
capskip-mcp ready (CapSkip at 127.0.0.1:8080)
```

A config problem exits immediately with a message naming the offending flag or variable, e.g.:

```
capskip-mcp: CAPSKIP_PORT must be a whole number, got 'abc'.
```

3. If it hangs with no output at all, the client is probably fine and CapSkip itself is the problem — see the next section.

---

## Every tool says "not reachable"

**Symptom:** A solve fails with:

```
CapSkip is not reachable at 127.0.0.1:8080. Confirm the CapSkip desktop app is running and that its API port matches this setting (override with CAPSKIP_HOST / CAPSKIP_PORT).
```

and `capskip_status` reports `reachable: false` with:

```
No response from 127.0.0.1:8080 (connect ECONNREFUSED 127.0.0.1:8080). Start the CapSkip desktop app, then confirm its API port matches — override with CAPSKIP_HOST / CAPSKIP_PORT.
```

**Cause:** The CapSkip desktop app is not running, or its API port does not match the `CAPSKIP_PORT` the server was started with.

**Fix**

1. Launch (or un-minimize) the CapSkip desktop app.
2. Open CapSkip Settings and confirm the **API port**.
3. Match it in your client config:

```json
"env": { "CAPSKIP_HOST": "127.0.0.1", "CAPSKIP_PORT": "8080" }
```

4. Call `capskip_status` again — it reports `reachable` and a `detail` string without needing CapSkip to solve anything, so it is the fastest way to confirm the fix worked.

---

## "Something is listening … but it did not answer as CapSkip"

**Symptom:** `capskip_status` reports `reachable: false` with:

```
Something is listening on 127.0.0.1:8080 but it did not answer as CapSkip (HTTP 404). Check the API port in CapSkip settings, and that nothing else has taken that port — override with CAPSKIP_HOST / CAPSKIP_PORT.
```

**Cause:** A different process holds that port. 8080 is a common default for local dev servers, proxies, and admin UIs, so this is easy to hit. CapSkip may not be running at all, or may be running on a different port.

**Fix**

1. Find what actually holds the port:

```bash
# macOS / Linux
lsof -i :8080

# Windows
netstat -ano | findstr :8080
```

2. Either stop that process, or point the server at CapSkip's real port with `CAPSKIP_PORT`.

Note that `capskip_status` deliberately reports this as **not** reachable. An earlier version treated any HTTP response as success, which meant it could report a healthy CapSkip seconds before a solve failed against the same port.

---

## "CapSkip rejected the API key"

**Symptom:**

```
CapSkip rejected the API key. Set CAPSKIP_API_KEY to the key shown in CapSkip settings, or disable key validation there.
```

**Cause:** API key validation is enabled in CapSkip, and either no key was configured or it does not match.

**Fix**

1. Copy the exact key from CapSkip Settings and set it:

```json
"env": { "CAPSKIP_API_KEY": "your-actual-key" }
```

2. Or, for local development only, disable API key validation in CapSkip Settings — any string (including the default `capskip`) is then accepted.

`capskip_status` diagnoses this without spending a solve. It reports `reachable: true` — CapSkip is running, the key is what is wrong — with:

```
CapSkip is running at 127.0.0.1:8080, but it rejected the API key. Set CAPSKIP_API_KEY to the key shown in CapSkip settings, or disable key validation there. Solves will fail until this is fixed.
```

---

## Solve times out

**Symptom:**

```
The solve did not finish within 300.0s. Raise the timeout parameter, or check CapSkip's own queue.
```

**Cause:** The captcha is taking longer than the configured budget, or CapSkip is stuck on it.

**Fix**

1. Pass a larger `timeout` on the tool call (capped at 600 seconds — a larger value is rejected outright, not silently clamped):

```json
{ "sitekey": "...", "url": "...", "timeout": 600 }
```

2. Or raise the default so you do not have to pass it every time. `CAPSKIP_TIMEOUT` covers `capskip_solve_image_captcha`; `CAPSKIP_RECAPTCHA_TIMEOUT` covers the other three tools. These env-level defaults have their own bound (1–3600s), independent of the 600s per-call cap:

```json
"env": { "CAPSKIP_RECAPTCHA_TIMEOUT": "600" }
```

3. Check CapSkip's own queue/log in the desktop app — a solve that never finishes is often stuck there, not waiting on the network.

The timeout error also names the CapSkip captcha id when one was assigned, so a solve that completes just after the deadline can still be read back via `res.php` or any CapSkip SDK.

---

## GeeTest always fails

**Symptom:** `capskip_solve_geetest` fails or times out even though `gt` and `challenge` look correct.

**Cause:** `challenge` is single-use and expires in about a minute. A value copied earlier, cached, or reused across two solves is already dead — this is the most common cause of GeeTest failures.

**Fix:** Fetch `gt` and `challenge` from the target page immediately before calling `capskip_solve_geetest`, and on failure fetch a fresh pair rather than retrying the same one:

```json
{
  "gt": "81388ea1fc187e0c335c0a8907ff2625",
  "challenge": "7cf6a8b1a2c34d5e6f7089abcdef0123",
  "url": "https://example.com/login"
}
```

If the site loads GeeTest from a non-default domain, pass it through as `api_server`, e.g. `"api-na.geetest.com"`.

---

## Turnstile token rejected by the site

**Symptom:** `capskip_solve_turnstile` returns a token, but Cloudflare still blocks the submission.

**Cause:** The token was submitted using a different User-Agent than the one CapSkip used to solve it. Cloudflare binds the token to the solving User-Agent and rejects a mismatch.

**Fix:** Use `userAgent` from the tool result as the `User-Agent` header (or equivalent setting in your browser-automation tool) when you submit `cf-turnstile-response`. If the result has no `userAgent`, CapSkip did not return one for that solve — retry, since resubmitting under an arbitrary User-Agent will not work either.

---

## hCaptcha or FunCaptcha never solves

**Symptom:** `capskip_solve_recaptcha` is called on a widget that has a `data-sitekey`, and every attempt fails, times out, or returns a token the site rejects.

**Cause:** The captcha is not a reCAPTCHA. CapSkip supports exactly four types — image captchas, reCAPTCHA v2/v3, Cloudflare Turnstile, and GeeTest v3. It **cannot** solve hCaptcha or FunCaptcha/Arkose, and there is no tool for them.

hCaptcha is easy to misidentify because it also carries a `data-sitekey`:

```html
<div class="h-captcha" data-sitekey="10000000-ffff-ffff-ffff-000000000001"></div>
```

**Fix:** Check the widget's class or script source before choosing a tool.

| Markup | Type | Tool |
|---|---|---|
| `class="g-recaptcha"`, `www.google.com/recaptcha/` | reCAPTCHA v2/v3 | `capskip_solve_recaptcha` |
| `class="cf-turnstile"`, `challenges.cloudflare.com` | Turnstile | `capskip_solve_turnstile` |
| `gt=` / `challenge=` from a GeeTest init call | GeeTest v3 | `capskip_solve_geetest` |
| `class="h-captcha"`, `js.hcaptcha.com` | hCaptcha | **not supported** |
| `funcaptcha` / `arkoselabs.com` | FunCaptcha/Arkose | **not supported** |

The server tells connected models this in its instructions, but a model can still guess wrong from the DOM alone. Retrying will not help — the type is the problem.

---

## reCAPTCHA v3 accepted but the site still blocks

**Symptom:** `capskip_solve_recaptcha` returns a token, the site's own verification accepts it, but the site still treats the visit as suspicious (blocks, challenges, or degrades the experience).

**Cause:** reCAPTCHA v3 is score-based. Google assigns the score from signals CapSkip has no access to — device and browsing history, IP reputation, and so on — and a locally-solved token carries whatever score Google decided. No solver, local or cloud, can raise a score after the token is issued. This is also why there is no `min_score` parameter on `capskip_solve_recaptcha`.

**Fix:** There isn't one at the token level. If the target consistently scores low, that is a signal problem with the requesting environment (IP reputation, browser fingerprint, request pattern), not something a solver call can override.

---

## Still stuck?

1. [CapSkip API docs](https://capskip.com/api-docs/)
2. [GitHub Issues](https://github.com/capskip/capskip-mcp/issues)
3. CapSkip support: support@capskip.com

When opening an issue, include:

- Node.js version (`node --version`)
- `capskip-mcp` version (from `package.json`, or `npx -y capskip-mcp@latest` to confirm you're current)
- CapSkip port and the captcha type involved
- The exact tool call and the full error text (redact sitekeys, tokens, and API keys)
