# ADR-017 — Admin area: users, settings, suppliers, history, reports, audit (ADM-001..006)

**Status:** APPROVED 2026-10-28 by the Project Director under the user's delegation of technical decisions.

## Context
SPEC §4, §13, §14, §21 and §22 ask for user and role management, restaurant settings, basic suppliers,
order history, operational reports with clear money definitions and CSV export, and a read-only audit
log. All of it must respect the role matrix of ADR-008 and never store or compute money as floats.

## Decision

### Shell
- `/admin` has a sidebar (`src/app/admin/layout.tsx`) that shows only the links the signed-in user may
  open. Every page and action still checks its own permission on the server.
- The admin UI stays English-only (ADR-013). `/admin` is an overview with live counts (active orders,
  open tables, pending assistance, unpaid on open tables) and today's figures.

### Users and roles (ADM-001) — `src/server/admin/users.ts`
- Admins create staff with one role per branch: ADMIN, CASHIER or KITCHEN. CAPTAIN has no login in the
  MVP (ADR-008).
- **Passwords:** the admin types a temporary password (10–128 characters) and hands it over in person.
  There is no email in the MVP, so no reset links. The hash comes from Better Auth's own `hashPassword`,
  so the account signs in through the normal flow.
- **Reset password** sets a new password, clears any lockout and deletes all of that user's sessions.
- **Deactivate** deletes the user's sessions at once; Better Auth's session hook already refuses
  inactive users (ADR-009).
- **Last admin guard:** an admin cannot demote or deactivate themselves, and no change may leave the
  branch without an active admin. Changes run under one advisory lock, so two admins demoting each
  other at the same time cannot both succeed.
- Every change is audited (`USER_CREATED`, `USER_UPDATED`, `USER_ROLE_CHANGED`, `USER_PASSWORD_RESET`).
  Passwords and hashes are never written to the audit log.

### Settings (ADM-002) — `src/server/admin/settings.ts`
- One form holds: the restaurant names and logo, time zone, currency, default and fallback language, tax
  rate, prices-include-tax, service charge, kitchen warning and overdue minutes, the table close
  policy, the assistance cooldown and the new-order sound.
- Percentages are typed as decimal text with up to two decimals and stored as basis points by string
  parsing, without floats.
- **Single tax rate** per branch in the MVP. The first active rate is updated, and any others are
  switched off.
- **Currency** is locked once the branch has orders, because prices and receipts are stored in minor
  units of that currency (ADR-011). Before any orders, it can change only to a currency with the same
  number of decimals while products exist.
- **Effect on orders:** new orders use the new settings. Past orders keep their stored totals.
- **Payment methods** can be added (unique code per branch) and enabled or disabled. They are never
  deleted.
- All changes are audited with before and after values.

### Suppliers (ADM-003) — `src/server/admin/suppliers.ts`
- Name, contact person, phone, email, address, tax number, notes and active flag. There is no purchasing
  or stock in the MVP. Suppliers are deactivated, never deleted, and changes are audited.

### Order history (ADM-004) — `src/server/admin/history.ts`
- Filters: business date range, table, kitchen or payment status, and order ref search. 50 orders per
  page.
- **Access:** admins (`orders.history_full`) see every date. Cashiers (`orders.history_recent`) see the
  last 7 business days, including the order detail page, per ADR-008.
- The detail page shows the items with their option snapshots, totals, payments and refunds with who
  recorded them, captain assignments, and the event history.

### Reports (ADM-005) — `src/server/admin/reports.ts`
- **Period:** an inclusive range of business dates (`orders.business_date`, fixed in the branch time
  zone when the order is placed). The default is today, and the maximum is 366 days. Cashiers
  (`reports.view_operational`) are limited to the last 7 days. Kitchen has no reports.
- **Definitions,** all from stored rows and computed with integer SQL sums:
  - **Gross:** item subtotals of non-cancelled orders, before discounts, tax and service.
  - **Order total:** gross − discounts + tax + service.
  - **Payments and refunds:** the payment rows recorded against the period's orders.
  - **Net recorded sales:** payments − refunds.
  - **Outstanding:** order totals not yet covered by net payments, for non-cancelled orders.
  - Cancelled orders are counted, but excluded from the money columns.
  - Unpaid orders are never shown as collected.
- **Sections:**
  - Sales by day, with totals.
  - Payment methods.
  - Kitchen status.
  - Top products (the top 20, by snapshot name).
  - Categories (by the product's current category).
  - Tables.
  - Average preparation time: placed → first READY event.
  - Average completion time: placed → DELIVERED event.
  - Captains: current assignments, delivered, and average time from assignment to delivery.
  - Cancelled orders with their reasons.
  - An empty section says "No data in this period" instead of showing zeros as findings.
- **CSV:** `GET /api/admin/reports/csv?section=…&from=…&to=…`. It has the same access and range rules
  and is `no-store`.
  - Money is written as plain decimals in the branch currency.
  - Cells starting with `=`, `+`, `-` or `@` are prefixed with `'` to prevent CSV formula injection.
    Plain numbers are left alone.

### Audit log (ADM-006)
- `/admin/audit` (`audit.view`, admin only) lists the branch's records newest first, filtered by date
  range in the branch time zone and by action. Before and after values can be expanded.
- There is no edit or delete anywhere. The table is insert-only (ADR-007).

## Consequences
- No new dependencies and no schema changes.
- Reports run live SQL over orders, which is fine for MVP volumes. Indexes on
  `(branch_id, business_date)` already exist. Pre-aggregation can come later if needed.
- Because reports follow the order's business date, a payment recorded after midnight for an order
  placed before midnight counts toward the earlier day. A cash-drawer report by payment time is a
  possible follow-up.
