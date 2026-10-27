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
- No business features yet, so only smoke tests exist (ARCH-002).
