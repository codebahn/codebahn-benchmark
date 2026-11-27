# codebahn-benchmark

Benchmarks how fast a coding agent works on Codebahn vs GitHub: agent transcripts are parsed and compared (TypeScript, tsx, vitest, Biome). `seed/` is the sample project the agents work on; `REPORT.md` holds the results.

## Commands

- Install: `pnpm install --frozen-lockfile`.
- Lint: `pnpm lint` (`biome check .`); `pnpm format` applies fixes.
- Test: `pnpm test` (vitest).
- `.claude/check` runs lint and test, the same as CI.

## Conventions

- Every GitHub Action is pinned to a full commit SHA with the version in a trailing comment. Keep that for anything you add.
- `agent/mcp-*.json` hold platform tokens and are gitignored; only the `*.example.json` files are committed. Never read or commit the real ones.

## Security

The constraints below apply everywhere.

Derived from the OpenSSF Security-Focused Guide for AI Code Assistant Instructions (2025-08-01, https://best.openssf.org/Security-Focused-Guide-for-AI-Code-Assistant-Instructions) and from securityblog.omegapoint.se (CC BY-SA 4.0).

- Never put secrets, tokens or credentials in code, config, tests, fixtures, logs or commit history. Read them from the environment or a vault reference.
- Never disable a security feature to make something work: TLS verification, CSRF, CSP, audience or signature checks, type checks in deserialization, lint or scanner rules. Ask instead.
- Never build SQL, shell commands, file paths or HTML from untrusted input by concatenation. Use parameterized queries, argument arrays, path validation and context-aware output encoding. Never sanitize HTML by regex rejection.
- Never accept an ID token as an access token. Every JWT check verifies an algorithm allow-list, issuer, audience, type and expiry, and signing keys are never shared across token purposes.
- Never match redirect URIs by prefix, wildcard or regex: exact string match against a registered list, after one decode.
- Never make a route anonymous by omission. New routes are authenticated by default; anonymous routes are allow-listed in one place with a comment saying why.
- Never take identity from a header a proxy could rewrite, and never enforce authorization only at a gateway or in client code; the service layer decides.
- Data-level access failures answer 404 for not-my-data, 403 for a missing permission and 401 when unauthenticated; never reveal that another tenant's object exists.
- Never log tokens, secrets, passwords or personal data. Log security-relevant denials and failures as warnings with enough context to investigate.
- Never add a dependency without a reason, a known maintainer and a pinned version. Prefer the standard library.
- Never compare secrets, tokens or hashes with ordinary equality; use constant-time comparison.
- Never leave security-relevant code without negative tests: unauthenticated, wrong permission and not-my-data for every endpoint, and a deny test for every permission mapping.

Before finishing a change that touches auth, sessions, tokens, permissions, uploads, SQL, shell, crypto or config, review your own diff against this list and fix what you find.
