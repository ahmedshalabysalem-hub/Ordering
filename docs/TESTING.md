# Testing

| Layer | Tool | Location | Needs DB | Command |
|---|---|---|---|---|
| Unit | Vitest | `tests/unit` | No | `pnpm test` |
| Integration | Vitest | `tests/integration` | Yes (`DATABASE_URL`) | `pnpm test:integration` |
| E2E | Playwright (Chromium) | `tests/e2e` | Yes | `pnpm build && pnpm test:e2e` |

- Integration tests use a real PostgreSQL, never mocks. Point `DATABASE_URL` at a throwaway database (e.g. `ordering_test`).
- E2E starts `pnpm start` on port 3100 (`E2E_PORT` to change) and reuses a running server locally.
- CI (`.github/workflows/ci.yml`) runs lint, typecheck, unit, integration, build and E2E on every PR against a PostgreSQL 16 service.

## Required coverage (from `docs/SPEC.md` §24)
Unit: order numbering, money/tax, modifier validation, permissions, state transitions, idempotency.
Integration: tables/QR, public menu, order submission, captains, kitchen status, payments, session close, assistance, authz, concurrency.
E2E: scenarios A–H plus the permanent-QR scenario (ADR-004): one printed QR handles several consecutive sessions.

## Known limitations
- No business features yet: tests cover the skeleton and database constraints only.

## Database in tests
- Integration tests run `drizzle/` migrations on `DATABASE_URL` first (`tests/integration/helpers/migrate.ts`).
- Tests use `inRollback()` so they leave no data behind; tests that need real concurrency commit and clean up after themselves.
- `tests/integration/schema.test.ts` covers the ADR-007 constraints: unique table numbers and QR tokens, one open session per table (QR token unchanged across sessions), order totals and line totals, unique order refs, atomic order-number allocation under 20 concurrent requests, one current captain assignment, one pending assistance request, refund reasons, insert-only audit log.
