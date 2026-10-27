# Task Board

Statuses: BACKLOG · READY · IN_PROGRESS · BLOCKED · REVIEW · DONE
Prefixes: ARCH, DB, AUTH, TBL, MENU, ORD, UI, RT, OPS, PAY, ADM, AUD, TEST, DOC

| ID | Title | Phase | Status | Depends on | Decision |
|---|---|---|---|---|---|
| DOC-001 | Define MVP scope | 1 | DONE | — | ADR-001, ADR-006 |
| ARCH-001 | Choose stack and hosting | 1 | DONE | — | ADR-005 |
| ARCH-002 | Skeleton, tooling, Docker, CI | 1 | IN_PROGRESS | ARCH-001 | ADR-005 |
| ARCH-003 | Data model design | 1 | READY (draft) | ADR-006 | DR-003 (to raise) |
| ARCH-004 | State machines + permission matrix | 1 | READY (draft) | ADR-006 | DR-004 (to raise) |
| DB-001 | Initial migrations | 2 | BACKLOG | ARCH-002, DR-003 | — |
| AUTH-001 | Staff auth, sessions, lockout, admin bootstrap | 2 | BACKLOG | DB-001 | — |
| AUTH-002 | Server-side RBAC guard | 2 | BACKLOG | AUTH-001, DR-004 | — |
| TBL-001 | Tables + permanent QR tokens + print cards | 2 | BACKLOG | AUTH-002 | ADR-004 |
| MENU-001 | Categories + products (AR/EN, images) | 2 | BACKLOG | AUTH-002 | — |
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
- Test: the same QR URL places orders across at least 3 consecutive sessions, each with a new order reference and its own tracking token.
