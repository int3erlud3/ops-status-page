# Security Policy

## Reporting a vulnerability

Please do **not** open a public issue for security problems. Use GitHub's
[private vulnerability reporting](../../security/advisories/new) for this repository
instead. You can expect an initial response within 7 days.

## Security review notes

- No runtime dependencies; dev dependencies are pinned in `package-lock.json` and
  audited with `npm audit` in CI.
- Rendering uses DOM APIs only (no HTML sinks); enforced by ESLint and tests.
- Strict CSP without `unsafe-inline`/`unsafe-eval`; no external resources.
- The optional local server binds to loopback, serves only regular files below the web
  root and sends defensive security headers.
- CI runs ESLint, the test suite, npm audit and a gitleaks secret scan on every push and
  pull request; GitHub Actions are pinned to commit SHAs and run with `contents: read` only.
