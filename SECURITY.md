# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| 1.0.x | Yes |

## Reporting a vulnerability

If you discover a security vulnerability in the CapSkip MCP server, please report it responsibly.

**Do not** open a public GitHub issue for security vulnerabilities.

Instead, email **support@capskip.com** with:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We aim to acknowledge reports within 48 hours and provide a status update within 7 days.

## Scope

This policy covers the `capskip-mcp` npm package in this repository.

The CapSkip desktop application itself is maintained separately — report app-level issues to CapSkip support.

## Best practices for SDK users

- Do not commit API keys or captcha tokens to version control
- Use environment variables for `CAPSKIP_API_KEY`
- CapSkip runs locally — ensure your firewall rules match your security requirements
- When using proxies, avoid logging credentials in application logs
