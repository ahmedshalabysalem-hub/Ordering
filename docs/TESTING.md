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

## Coverage map (SPEC §24, TEST-001..003)
| SPEC item | Where it is tested |
|---|---|
| Order number generation | `unit/pricing.test.ts`, `integration/schema.test.ts` (gap-free counters under 20 concurrent requests), `integration/orders.test.ts` (20 concurrent orders on one table) |
| Money, tax, service | `unit/money.test.ts`, `unit/pricing.test.ts`, `integration/admin.test.ts` (settings in basis points used by new orders) |
| Modifier validation | `unit/selection.test.ts`, `integration/modifiers.test.ts` |
| Roles and permissions | `unit/permissions.test.ts`, `integration/authorization.test.ts`, every service test (403 for the wrong role), `e2e/scenarios.spec.ts` (Scenario F), `e2e/admin.spec.ts` |
| Order, session and payment transitions | `integration/operations.test.ts`, `integration/sessions.test.ts`, `unit/payment-status.test.ts`, `integration/payments.test.ts` |
| Idempotency | `integration/orders.test.ts` (5 parallel retries, one order), `e2e/orders.spec.ts` (Scenario G) |
| Tables and permanent QR | `integration/tables.test.ts`, `integration/orders.test.ts` (one QR across 3 consecutive sessions), `e2e/tables.spec.ts`, `e2e/scenarios.spec.ts` (new session and reference after closing) |
| Public menu, submit, items and options | `integration/customer.test.ts`, `integration/orders.test.ts`, `e2e/customer.spec.ts` |
| Captains, kitchen status, payments, close, assistance | `integration/operations.test.ts`, `integration/payments.test.ts`, `integration/sessions.test.ts`, `integration/customer.test.ts` |
| Concurrency | two kitchen moves, two assistance handlers, two payments, two closes, close vs new order, two admins demoting each other (integration); two cashiers on one table over HTTP (`e2e/scenarios.spec.ts`, Scenario H) |
| Real-time | `integration/realtime.test.ts`, `e2e/realtime.spec.ts`, and the live updates asserted in scenarios A–E |
| Reports and history | `integration/admin.test.ts`, `e2e/admin.spec.ts` |

**E2E scenarios** (`tests/e2e/scenarios.spec.ts`) run SPEC §24.3 in one browser session per role:
- **A–E as one journey.**
  - The admin creates table 12, and the guest orders in Arabic from its QR link, signed out.
  - The kitchen accepts, prepares and readies the order. The cashier and the guest see each change live.
  - The cashier assigns a captain and marks the order served.
  - The guest asks for help, and staff acknowledge and resolve it.
  - Cash payment, then the table closes and becomes available.
  - The order appears in history with its payment and captain.
  - The same QR code then starts a new session with a new reference.
- **F.** Signed-out and kitchen users are refused admin pages and APIs, a guessed order reference opens nothing, and a manipulated price is ignored.
- **H.** Two parallel "start closing" requests on one table get one `200` and one `409` with a clear message.
- **G** is in `orders.spec.ts`.

## External services
None are needed. Payments are recorded manually (ADR-016), and there is no email or SMS, so every test runs locally and in CI.

## Database in tests
- Integration and E2E runs reset the test database and apply `drizzle/` migrations first (`tests/helpers/test-db.ts`). E2E then creates an admin with the real `pnpm admin:bootstrap` command.
- Tests use `inRollback()` so they leave no data behind; tests that need real concurrency commit and clean up after themselves.
- `tests/integration/schema.test.ts` covers the ADR-007 constraints: unique table numbers and QR tokens, one open session per table (QR token unchanged across sessions), order totals and line totals, unique order refs, atomic order-number allocation under 20 concurrent requests, one current captain assignment, one pending assistance request, refund reasons, insert-only audit log.
- `tests/integration/auth.test.ts` covers admin bootstrap (defaults, single-use, hashed password, audit entry), sign-in, identical errors for unknown email and wrong password, lockout and unlock, inactive users, disabled sign-up.
- `tests/e2e/auth.spec.ts` covers the redirect to sign-in, a wrong password, and sign-in and sign-out in the browser.
- `tests/unit/permissions.test.ts` and `tests/integration/authorization.test.ts` cover the ADR-008 matrix, branch scoping and 401/403 (Scenario F items for kitchen and cashier).
- Customer app (UI-001..005): `tests/unit/cart.test.ts` (merging lines, quantity caps, no prices in the request body, idempotency key reuse, defensive parsing of the stored cart), `tests/unit/i18n.test.ts` (Arabic has every English key and placeholder, field fallback, Western digits, customer status), `tests/integration/customer.test.ts` (public menu hides inactive and internal data, tracking only by the exact token with snapshots, assistance deduplication under concurrency, cooldown, inactive tables) and `tests/e2e/customer.spec.ts` (Scenario A on a phone-sized screen in Arabic then English, options, refresh keeps cart and language, server-priced checkout, live status change, other-table warning, price-change confirmation, assistance once, unknown tracking link).
- Real-time (RT-001): `tests/integration/realtime.test.ts` (committed order and assistance events carry ids only; a rolled-back transaction sends nothing) and `tests/e2e/realtime.spec.ts` (a signed-in admin's browser receives a new order on `/api/staff/events`; anonymous and unknown-token streams are refused). `customer.spec.ts` checks that a status change reaches the open order page within 5 seconds.
- Operations (OPS-001..004): `tests/integration/operations.test.ts` (kitchen order of moves and version conflicts, two cooks racing, cancel rules by role and reason, no cancel with payments, captain history and inactive captains, serving only READY orders, assistance handled once, board contents and role checks) and `tests/e2e/operations.spec.ts` (a guest's order shows up on the kitchen and cashier screens without a reload, kitchen moves change the cashier grid live, captain assignment, mark served, close refused while unpaid, assistance handling, sign-in required).
- Payments (PAY-001): `tests/unit/payment-status.test.ts` (derived status table) and `tests/integration/payments.test.ts` (full amount only and stale-amount guard, inactive methods, whole-table payment then close, two cashiers paying at once, admin-only refunds with reason and limit, refund to the last method, no payments on cancelled orders). `tests/e2e/operations.spec.ts` records a card payment with a reference and then closes the table.
- Admin (ADM-001..006): `tests/integration/admin.test.ts` (report money definitions, date ranges and the cashier 7-day limit, CSV formula escaping; user creation with a working password, reset, last-admin guard under concurrency, session revocation; settings in basis points, tax used by new orders, currency lock; suppliers branch isolation; history and audit access). `tests/e2e/admin.spec.ts` (an admin creates a cashier, cannot demote themselves, saves settings, adds a payment method and a supplier, sees them in the audit log; the cashier is refused admin pages; reports, CSV download and order detail reflect a real order).
