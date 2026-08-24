# Setup

You have access to MCP tools for interacting with a Git hosting platform.
The repository is {owner}/{repo}.

Create the following labels and issues. If a label already exists, skip it.

## Labels

1. **bug** (color: d73a4a)
2. **enhancement** (color: a2eeef)

## Issues

### Issue 1: validateEmail accepts obviously invalid addresses

Label: bug

Body:

`validateEmail("@")` returns `{ valid: true }`, but this is not a valid email.

Other failing cases:
- `validateEmail("foo@")` returns valid (no domain)
- `validateEmail("@bar.com")` returns valid (no local part)
- `validateEmail("foo bar@baz.com")` returns valid (contains spaces)

The function only checks for the presence of `@`, which is not sufficient.

Expected: at minimum, require a non-empty local part, a non-empty domain with a dot, and no whitespace.

Comment on the issue: "Reproduced. The check is just `input.includes('@')`. Needs a proper regex or at least structural validation."

### Issue 2: formatCurrency drops decimal places on round numbers

Label: bug

Body:

`formatCurrency(10)` returns `"€10"` instead of `"€10.00"`.

Steps to reproduce:
1. `formatCurrency(10)` returns `"€10"` (expected `"€10.00"`)
2. `formatCurrency(10.5)` returns `"€10.5"` (expected `"€10.50"`)
3. `formatCurrency(10.99)` returns `"€10.99"` (this one is correct)

The issue is that JavaScript's number-to-string conversion omits trailing zeros. Currency values should always show two decimal places.

Comment on the issue: "Confirmed. The fix is straightforward: use `.toFixed(2)` on the amount before formatting."

### Issue 3: Add URL validation function

Label: enhancement

Body:

We have username and email validation, but no URL validation. Would be useful for validating webhook callback URLs.

Acceptance criteria:
- Must start with `http://` or `https://`
- Must have a valid-looking domain
- Should accept ports and paths
- Add to the public exports in index.ts

Comment on the issue: "Makes sense. Lower priority than the open bugs though."
