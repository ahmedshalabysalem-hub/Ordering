# Testing

| Layer | Tool | Location | Needs DB | Command |
|---|---|---|---|---|
| Unit | Vitest | `tests/unit` | No | `pnpm test` |
| Integration | Vitest | `tests/integration` | Yes (`DATABASE_URL`) | `pnpm test:integration` |
| E2E | Playwright (Chromium) | `tests/e2e` | Yes | `pnpm build && pnpm test:e2e` |

- Integration and E2E tests use a real PostgreSQL, never mocks. They **drop and recreate** the database in `DATABASE_URL`, and refuse unless its name ends in `_test` (e.g. `ordering_test`).
- Both also need `BETTER_AUTH_SECRET` (any 32+ characters) and, for E2E, `BETTER_AUTH_URL=http://localhost:3100`. `BETTER_AUTH_URL` is also the public base URL printed in table QR codes. Integration tests store uploads in a temporary folder; E2E uses `UPLOAD_DIR` (default `./storage/uploads`, git-ignored).
- E2E starts `pnpm start` on port 3100 (`E2E_PORT` to change) and reuses a running server locally.
- CI (`.github/workflows/ci.yml`) runs lint, typecheck, unit, integration, build and E2E on every PR against a PostgreSQL 16 service.

## Required coverage (from `docs/SPEC.md` §24)
Unit: order numbering, money/tax, modifier validation, permissions, state transitions, idempotency.
Integration: tables/QR, public menu, order submission, captains, kitchen status, payments, session close, assistance, authz, concurrency.
E2E: scenarios A–H plus the permanent-QR scenario (ADR-004): one printed QR handles several consecutive sessions.

## Known limitations
- No business features yet: tests cover the skeleton and database constraints only.

## Database in tests
- Integration and E2E runs reset the test database and apply `drizzle/` migrations first (`tests/helpers/test-db.ts`). E2E then creates an admin with the real `pnpm admin:bootstrap` command.
- Tests use `inRollback()` so they leave no data behind; tests that need real concurrency commit and clean up after themselves.
- `tests/integration/schema.test.ts` covers the ADR-007 constraints: unique table numbers and QR tokens, one open session per table (QR token unchanged across sessions), order totals and line totals, unique order refs, atomic order-number allocation under 20 concurrent requests, one current captain assignment, one pending assistance request, refund reasons, insert-only audit log.
- `tests/integration/auth.test.ts` covers admin bootstrap (defaults, single-use, hashed password, audit entry), sign-in, identical errors for unknown email and wrong password, lockout and unlock, inactive users, disabled sign-up.
- `tests/e2e/auth.spec.ts` covers the redirect to sign-in, a wrong password, and sign-in and sign-out in the browser.
- `tests/unit/permissions.test.ts` and `tests/integration/authorization.test.ts` cover the ADR-008 matrix, branch scoping and 401/403 (Scenario F items for kitchen and cashier).
- Customer app (UI-001..005): `tests/unit/cart.test.ts` (merging lines, quantity caps, no prices in the request body, idempotency key reuse, defensive parsing of the stored cart), `tests/unit/i18n.test.ts` (Arabic has every English key and placeholder, field fallback, Western digits, customer status), `tests/integration/customer.test.ts` (public menu hides inactive and internal data, tracking only by the exact token with snapshots, assistance deduplication under concurrency, cooldown, inactive tables) and `tests/e2e/customer.spec.ts` (Scenario A on a phone-sized screen in Arabic then English, options, refresh keeps cart and language, server-priced checkout, live status change, other-table warning, price-change confirmation, assistance once, unknown tracking link).
