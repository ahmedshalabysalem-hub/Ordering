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
| MENU-001 | Categories + products (AR/EN, images) | 2 | REVIEW | AUTH-002 | ADR-011 |
| MENU-002 | Modifier groups/options | 2 | BACKLOG | MENU-001 | — |
| ORD-001 | Order creation: pricing, snapshots, idempotency | 2 | BACKLOG | MENU-002, TBL-001 | — |
| ORD-002 | Atomic order numbering + table sessions | 2 | BACKLOG | ORD-001 | — |
| AUD-001 | Audit log | 2 | BACKLOG | DB-001 | — |
| UI-001..005 | Customer app (menu, i18n, cart, submit, tracking, assistance) | 3 | BACKLOG | ORD-002 | — |
| RT-001 | Real-time (SSE + NOTIFY) with fallback | 4 | BACKLOG | ORD-001 | — |
| OPS-001..004 | Cashier grid, KDS, captains/delivery, session close | 4 | BACKLOG | RT-001 | — |
| PAY-001 | Manual payment recording | 4 | BACKLOG | ORD-002 | — |
| ADM-001..005 | Users, suppliers, settings, reports, audit view | 5 | BACKLOG | AUTH-002 | — |
| TEST-001..003 | E2E A–H + permanent-QR scenario, concurrency, authz suite | 6 | BACKLOG | 3, 4, 5 | ADR-004 |
| DOC-002 | Setup/deploy docs + delivery report | 7 | BACKLOG | TEST-* | — |

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
