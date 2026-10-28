# Task Board

Statuses: BACKLOG · READY · IN_PROGRESS · BLOCKED · REVIEW · DONE
Prefixes: ARCH, DB, AUTH, TBL, MENU, ORD, UI, RT, OPS, PAY, ADM, AUD, TEST, DOC

| ID | Title | Phase | Status | Depends on | Decision |
|---|---|---|---|---|---|
| DOC-001 | Define MVP scope | 1 | DONE | — | ADR-001, ADR-006 |
| ARCH-001 | Choose stack and hosting | 1 | DONE | — | ADR-005 |
| ARCH-002 | Skeleton, tooling, Docker, CI | 1 | DONE | ARCH-001 | ADR-005, PR #1 |
| ARCH-003 | Data model design | 1 | DONE | ADR-006 | ADR-007 |
| ARCH-004 | State machines + permission matrix | 1 | DONE | ADR-006 | ADR-008 |
| DB-001 | Initial schema, migrations, constraint tests | 2 | DONE | ARCH-002, ADR-007 | PR #2 |
| AUTH-001 | Staff auth, sessions, lockout, admin bootstrap | 2 | DONE | DB-001 | ADR-009, PR #3 |
| AUTH-002 | Server-side RBAC guard | 2 | DONE (PR #4) | AUTH-001 | ADR-008 |
| TBL-001 | Tables + permanent QR tokens + print cards | 2 | DONE (PR #5) | AUTH-002 | ADR-004 |
| MENU-001 | Categories + products (AR/EN, images) | 2 | DONE (PR #6) | AUTH-002 | ADR-011 |
| MENU-002 | Modifier groups/options | 2 | DONE (PR #7) | MENU-001 | — |
| ORD-001 | Order creation: pricing, snapshots, idempotency, session open + atomic numbering | 2 | DONE (PR #8) | MENU-002, TBL-001 | ADR-012 |
| ORD-002 | Table session lifecycle (closing/close with version check) + cashier table overview | 2 | DONE (PR #9) | ORD-001 | ADR-008 |
| AUD-001 | Audit log | 2 | DONE (written by every service since PR #3) | DB-001 | ADR-007 |
| UI-001 | Customer menu page (categories, products, images, sold out, options) | 3 | DONE (PR #10) | ORD-002 | ADR-013 |
| UI-002 | Arabic/English with RTL, language kept in a cookie, field fallback | 3 | DONE (PR #10) | UI-001 | ADR-013 |
| UI-003 | Cart (localStorage, quantities, notes, other-table warning) | 3 | DONE (PR #10) | UI-001 | ADR-013 |
| UI-004 | Checkout: server quote, idempotent submit, price-change confirmation | 3 | DONE (PR #10) | UI-003, ORD-001 | ADR-012, ADR-013 |
| UI-005 | Order confirmation and tracking by token, assistance request | 3 | DONE (PR #10) | UI-004 | ADR-013 |
| RT-001 | Real-time (SSE + NOTIFY) with fallback | 4 | DONE (PR #11) | ORD-001 | ADR-014 |
| OPS-001 | Cashier dashboard: live table grid, order details, table close | 4 | DONE (PR #12) | RT-001 | ADR-015 |
| OPS-002 | Kitchen display: tickets, status moves, age alerts, sold-out switches | 4 | DONE (PR #12) | RT-001 | ADR-015 |
| OPS-003 | Captains: admin list, assign/reassign/unassign, mark served | 4 | DONE (PR #12) | OPS-001 | ADR-015 |
| OPS-004 | Assistance handling (acknowledge, resolve) | 4 | DONE (PR #12) | OPS-001 | ADR-015 |
| PAY-001 | Manual payment recording, pay whole table, admin refunds | 4 | DONE (PR #13) | ORD-002 | ADR-016 |
| ADM-001 | Users and roles: create, role, deactivate, reset password, last-admin guard | 5 | DONE (PR #14) | AUTH-002 | ADR-017 |
| ADM-002 | Settings: restaurant, logo, time zone, currency, languages, tax, service, kitchen times, close policy, payment methods | 5 | DONE (PR #14) | AUTH-002 | ADR-017 |
| ADM-003 | Suppliers | 5 | DONE (PR #14) | AUTH-002 | ADR-017 |
| ADM-004 | Order history with detail (admin all, cashier 7 days) and admin overview | 5 | DONE (PR #14) | PAY-001 | ADR-017 |
| ADM-005 | Reports (SPEC §22) with date filters and CSV | 5 | DONE (PR #14) | PAY-001 | ADR-017 |
| ADM-006 | Audit log viewer (read-only) | 5 | DONE (PR #14) | AUD-001 | ADR-017 |
| TEST-001..003 | E2E A–H + permanent-QR scenario, concurrency, authz suite, coverage map | 6 | DONE (PR #15) | 3, 4, 5 | ADR-004 |
| DOC-002 | Setup/deploy docs (Dockerfile, production compose, backups) + delivery report | 7 | REVIEW | TEST-* | — |

Rows like `UI-001..005` are split into individual tasks when their phase starts.

## TBL-001 — acceptance (ADR-004)
- Table creation generates one permanent random token stored on the table, separate from session and order IDs.
- Creating orders, closing orders/sessions or resetting the table never changes the token.
- Regenerate/revoke exists only as an explicit, audited admin action.
- Test: the same QR URL places orders across at least 3 consecutive sessions, each with a new order reference and its own tracking token. _(Needs orders: added with ORD-001 / TEST-001. TBL-001 covers creation, edit-keeps-token, audited regeneration and the retired old URL.)_
- Code: `src/server/tables/service.ts` (all table writes, audit), `src/server/tables/qr.ts` (PNG/SVG), admin UI under `/admin/tables`, customer landing at `/order/table/{token}`.

## AUTH-002 — how to protect new code
- Server actions / route handlers: `const staff = await authorize("menu.manage", branchId)`; route handlers wrap with `authErrorResponse(e)` for 401/403 JSON.
- Pages: `await requirePermission("menu.manage")` (redirects to `/login` or `/forbidden`), inside `<Suspense>`.
- Permission names and the role map live in `src/server/auth/permissions.ts` (ADR-008). Changing the map is a project-level decision.
