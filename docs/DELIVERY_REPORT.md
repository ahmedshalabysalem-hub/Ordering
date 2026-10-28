# Delivery report — Restaurant & Café QR Ordering and Management System

_2026-10-28 · main after DOC-002 · SPEC §31_

## 1. Architecture and technologies
- **Next.js 16** (App Router, TypeScript, React 19) is a single app. It holds:
  - the public customer pages
  - the staff and admin screens
  - the JSON and SSE APIs
  - the server actions

  All business logic sits in `src/server/` services, and the UI never computes money or changes state on its own.
- **PostgreSQL 16** with **Drizzle ORM**. Migrations are in `drizzle/`.
- **Better Auth** handles staff email and password sign-in.
- **Server-Sent Events** carry live updates, fed by PostgreSQL `LISTEN/NOTIFY`.
- **Tailwind CSS** for styling. Vitest and Playwright for tests.
- **Packaging:** a Docker image with Compose, and GitHub Actions CI.
- Decisions are in `docs/DECISIONS.md` (ADR-000..017). Key ones:
  - ADR-005: stack.
  - ADR-007: data model.
  - ADR-008: state machines and permissions.
  - ADR-012: pricing and order creation.
  - ADR-014: real-time.

## 2. Implemented features
- **Customer** (no login, mobile-first, Arabic RTL and English LTR):
  - Menu by table QR code.
  - Product options with validation.
  - Cart that survives a refresh, with a warning when it belongs to another table.
  - Quote checked by the server, with confirmation when prices changed.
  - Idempotent submit.
  - Confirmation and live tracking by a secret token.
  - "My orders" for the table.
  - Assistance button with dedup and cooldown.
- **Kitchen display:**
  - Live tickets with options and notes.
  - Accept, start preparing, ready.
  - Age warnings.
  - Sold-out switches.
- **Cashier:**
  - Live table grid with colours.
  - Order details.
  - Cancel with a reason.
  - Assign, reassign or remove a captain.
  - Mark served.
  - Record a payment per order or for the whole table.
  - Assistance handling.
  - Close the table according to the policy.
- **Admin:**
  - Overview with live counts.
  - Tables and permanent QR codes, with PNG and SVG downloads and printable cards, and audited regeneration.
  - Menu categories and products with images, prices, SKU, prep station, availability and order.
  - Option groups.
  - Captains.
  - Users and roles.
  - Settings.
  - Payment methods.
  - Suppliers.
  - Order history with full detail.
  - Reports with CSV.
  - Read-only audit log.
  - Refunds (admin only).

## 3. Database entities and migrations
- **Entities:**
  - Restaurant and settings: `restaurants`, `branches`, `branch_settings`, `tax_rates`, `payment_methods`.
  - Staff and sign-in: `users`, `user_roles`, `auth_sessions`, `auth_accounts`, `auth_verifications`.
  - Tables and menu: `dining_tables`, `menu_categories`, `products`, `modifier_groups`, `modifier_options`, `product_modifier_groups`.
  - Orders: `table_sessions`, `order_counters`, `orders`, `order_items`, `order_item_modifiers`, `order_events`, `idempotency_keys`.
  - Service and payments: `captains`, `captain_assignments`, `payments`, `assistance_requests`.
  - Other: `suppliers`, `audit_logs`.
- **Rules built into the schema:**
  - UUID v7 keys.
  - Money is always `bigint` minor units.
  - Check constraints on statuses and totals.
  - At most one open session per table, one pending assistance request per table, and one current captain per order.
  - Order references are unique per branch.
- **Migrations:**
  - `0000_init`
  - `0001_audit_logs_insert_only`: a trigger blocks update and delete.
  - `0002_auth_tables`
  - `0003_order_ref_per_branch`

## 4. Authentication and authorization
- **Staff sign-in:**
  - Sign-up is disabled. Accounts are created by the admin or by the one-time bootstrap command.
  - Passwords are 10–128 characters.
  - Sessions last 12 hours and are stored in the database.
  - After 5 failed sign-ins the account is locked for 15 minutes. Sign-in is also rate-limited.
  - Inactive or locked users never get a session.
- **Roles** (ADR-008): ADMIN, CASHIER and KITCHEN, plus CAPTAIN reserved for later. Each maps to a permission set in `src/server/auth/permissions.ts`.
- **Every page, server action and API checks its permission on the server, scoped to the branch.** The UI only hides links.
- **Customers:**
  - Customers never log in.
  - The table QR token identifies only the table.
  - The tracking token is a separate 32-character random value.

## 5. QR codes and order numbering
- Each table gets one permanent random token when it is created (ADR-004). The link is `/order/table/{token}`.
- The token never changes when orders, sessions or closes happen. Only an explicit, audited admin action replaces it, and that retires the old link.
- Order reference: `YYYYMMDD-T{table:3}-{seq:4}`, for example `20261028-T012-0001`.
  - The date is the business date in the branch time zone.
  - The number comes from a per-table, per-day counter under a row lock, so it is gap-free and unique even under concurrency.
- Tests prove that one printed QR code serves 3 consecutive sessions with new references each time.

## 6. Real-time design
- Services call `publish(tx, event)` inside the writing transaction. That runs `pg_notify`, which PostgreSQL delivers only when the transaction commits.
- Events carry ids only.
- Each process holds one `LISTEN` connection and fans events out to the SSE streams:
  - Staff: branch-scoped, re-authorized every 10 minutes.
  - Customer: per tracking token, order updates only, with caps on the number of streams.
- Clients re-read the state on every event and every reconnect. They refresh every 60 s as a safety net and fall back to 15 s polling.

## 7. Business rules and transitions
These are in `docs/architecture/STATE_MACHINES.md`, ADR-012 and ADR-015..017.
- **Kitchen:** NEW → ACCEPTED → IN_PREPARATION → READY.
  - A cashier may cancel before preparation, and an admin after it.
  - A paid order must be refunded before it is cancelled.
- **Delivery:** NOT_ASSIGNED → ASSIGNED → DELIVERED. Serving without a captain is allowed.
- **Payment status** is always derived from the payment rows:
  - Unpaid, paid, partially refunded or refunded. Partial payments are off.
  - Each payment is the full outstanding amount, checked against the amount on the screen.
  - Refunds need a reason and cannot exceed the net amount paid.
- **Session:** OPEN → CLOSING → CLOSED.
  - It closes only when every order is paid, and also delivered under the default policy. Cancelled orders don't block it.
  - New orders cannot enter a session that is closing.
- **Assistance:** PENDING → ACKNOWLEDGED → RESOLVED.
- **Concurrency and audit:**
  - Every change uses a row lock plus a version check, so a stale screen gets a clear "someone else changed this" error.
  - Every staff action is audited.
- **Pricing:**
  - Integer arithmetic, rounding half up.
  - Tax is applied once per order, with prices either inclusive or exclusive of tax.
  - The service charge is not taxed.
  - Item names and prices are copied onto the order at the time it is placed.

## 8. Tests executed (actual results)
All of these were run against a real PostgreSQL 16, with no mocks.

| Suite | Result | Where it ran |
|---|---|---|
| Lint + typecheck | pass | local + CI |
| Unit (Vitest) | **53 passed** | local + CI |
| Integration (Vitest + PostgreSQL) | **90 passed** | local + CI |
| E2E (Playwright, Chromium, production build) | **32 passed**, including SPEC scenarios A–H and the permanent-QR scenario | local + CI |

- CI runs all of the above on every PR and passed on PR #15 (2026-10-28).
- The coverage map is in `docs/TESTING.md`.
- No test needs an external service.

## 9. Build status
- `pnpm build` succeeds, locally and in CI.
- The Docker image builds.
- `docker-compose.prod.yml` was verified locally on 2026-10-28:
  - Migrations ran, the health check passed and the bootstrap worked.
  - A real order went from QR link to kitchen screen live.

## 10. Known limitations
- **Payments are recorded manually** (cash, card terminal, wallet). There is no online card processing, which is out of scope per SPEC §28.
- **One payment per order or per table, with no split bills.** A whole-table payment uses one method.
- **One tax rate per branch.** There are no discounts in the UI; the column exists and is always 0.
- **One restaurant and one branch in the UI.** The schema is multi-branch.
- **The admin UI is in English.** The customer UI is in Arabic and English.
- **There is no captain login.** Captains are assigned by the cashier.
- **Rate limits for public endpoints and sign-in are kept in memory,** so run one app instance.
- **Reports group money by the order's business date.** There is no cash-drawer report by payment time yet.
- **Unknown QR or tracking links show the not-found page with HTTP 200,** because the pages stream.
- **Old menu images are not cleaned up from disk** after they are replaced.
- **There is no email or SMS.** Password resets are done by the admin.
- **Settings items from SPEC §27 that are fixed rather than configurable:**
  - The supported languages are Arabic and English.
  - The order numbering format.
  - Menu availability behaviour: sold-out items are shown as unavailable.

## 11. Remaining defects or blocked tasks
- No known open defects.
- Nothing is blocked.
- A production deployment needs a server, a domain and HTTPS, which are the owner's choice and cost. See `docs/DEPLOYMENT.md`.

## 12. Environment variables
- Required:
  - `DATABASE_URL`
  - `BETTER_AUTH_SECRET` (32+ random characters)
  - `BETTER_AUTH_URL` (the public HTTPS URL, which is printed in QR codes)
- Optional: `UPLOAD_DIR` and `PORT`.
- For Compose: `POSTGRES_PASSWORD`.
- See `.env.example` and `docs/DEPLOYMENT.md` §2.

## 13. Commands
| Purpose | Command |
|---|---|
| Install | `pnpm install` |
| Development | `pnpm dev` |
| Production | `pnpm build && pnpm start` |
| Tests | `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && pnpm build && pnpm test:e2e` |
| Docker | `docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build` |

## 14. Migrations and bootstrap
- Run `pnpm db:migrate`. The Docker image does this on every start.
- Run `pnpm admin:bootstrap --email … --name …` once. It:
  - creates the first admin, plus the restaurant and branch with the defaults (EGP, Africa/Cairo, Arabic, VAT 14%, Cash and Card)
  - reads the password from a hidden prompt or `BOOTSTRAP_ADMIN_PASSWORD`
  - refuses to run again once an admin exists

## 15. Deployment and backups
These are in `docs/DEPLOYMENT.md`:
- Docker Compose behind Caddy or nginx with HTTPS and SSE buffering off.
- Daily `pg_dump` and an uploads-volume archive, kept off the server, with a restore procedure.
- One app instance.
- Back up before every update.

## 16. Acceptance criteria (SPEC §30)
Legend: ✅ implemented and tested end to end · 🟡 implemented, not fully tested · 🟠 partial · ❌ not implemented · ⛔ blocked

| | Criterion | Status | Evidence |
|---|---|---|---|
| A | Admin logs in and creates a table | ✅ | `e2e/tables.spec.ts`, `e2e/scenarios.spec.ts` A |
| B | Valid QR code generated | ✅ | QR SVG/PNG in `tables.spec.ts`; scanned link opens the table |
| C | Table appears in the operational dashboard | ✅ | scenarios A (cashier grid shows table 12) |
| D | Customer opens the menu without logging in | ✅ | scenarios A (signed-out browser), `customer.spec.ts` |
| E | Arabic/English switch | ✅ | `customer.spec.ts`, scenarios A |
| F | Multiple products, quantities, valid options | ✅ | `customer.spec.ts`, `integration/modifiers.test.ts`, `unit/selection.test.ts` |
| G | Submit and get a unique reference | ✅ | scenarios A, `integration/orders.test.ts` |
| H | Order stored with item and price snapshots | ✅ | `integration/orders.test.ts` |
| I | Kitchen and cashier receive it live (or fallback) | ✅ | scenarios A/B, `realtime.spec.ts`, `operations.spec.ts` |
| J | Kitchen progresses valid states | ✅ | scenarios B, `integration/operations.test.ts` |
| K | Secure customer tracking | ✅ | scenarios B (live), F (guessed reference refused) |
| L | Cashier assigns a captain | ✅ | scenarios C |
| M | Captain and delivery history kept | ✅ | scenarios C/E (history page), `integration/operations.test.ts` |
| N | Assistance requested, acknowledged and resolved | ✅ | scenarios D, `integration/customer.test.ts` |
| O | Cashier records payment | ✅ | scenarios E, `integration/payments.test.ts` |
| P | Close order and session per policy | ✅ | scenarios E, `integration/sessions.test.ts` |
| Q | Table available again, history kept | ✅ | scenarios E (new session, new reference, old order in history) |
| R | Admin actions authorized on the server | ✅ | scenarios F, `integration/authorization.test.ts`, per-service 403 tests |
| S | Duplicate and conflicting requests are safe | ✅ | `orders.spec.ts` (G), scenarios H, concurrency integration tests |
| T | Automated tests cover business and security flows | ✅ | §8 above |
| U | Starts from the documented setup | ✅ | `docs/DEPLOYMENT.md` Docker steps run end to end on 2026-10-28. The README local steps are the same commands CI and the test runs use: migrate, bootstrap, build, start. |
| V | Production build succeeds | ✅ | CI and local `pnpm build`, Docker image build |
| W | No critical function relies on demo data or dead buttons | ✅ | Everything reads from the database. The bootstrap creates only the restaurant defaults, which can be changed in Settings. |
