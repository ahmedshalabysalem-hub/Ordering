# Implementation Plan

Phases follow `docs/SPEC.md` §29. Task IDs live in `docs/TASK_BOARD.md`; phase numbers here are only grouping.

| Phase | Goal | Key tasks | Depends on |
|---|---|---|---|
| 1. Assessment & architecture | Stack, entities, state machines, permissions | ARCH-001..004 | DR-001, DR-002 |
| 2. DB & backend foundation | Migrations, auth/RBAC, tables+QR, menu, orders+numbering, sessions, audit | DB-001, AUTH-001/002, TBL-001, MENU-001/002, ORD-001/002, AUD-001 | 1 |
| 3. Customer experience | QR menu, AR/EN RTL, modifiers, cart, submit, tracking, assistance | UI-001..005 | 2 |
| 4. Cashier & kitchen | Table grid, alerts, KDS, captains, delivery, manual payment, session close, real-time | RT-001, OPS-001..004, PAY-001 | 3 |
| 5. Administration | Users/roles, suppliers, settings, reports, audit views | ADM-001..005 | 2 |
| 6. Testing & stabilization | E2E scenarios A–H, concurrency, authz | TEST-001..003 | 3, 4, 5 |
| 7. Delivery | Docs, deploy, delivery report | DOC-002, OPS-DEPLOY | 6 |

## Phase 1 detail (next up)
1. **ARCH-001** — approve DR-001 (stack) and DR-002 (business defaults).
2. **ARCH-002** — repo skeleton: Next.js + TS, pnpm, Drizzle, Docker Compose (Postgres), lint/format, Vitest, Playwright, GitHub Actions CI, `.env.example`, README. Acceptance: CI green on an empty app with one passing unit, integration and E2E test.
3. **ARCH-003** — `docs/architecture/DATA_MODEL.md`: entities, keys, constraints, indexes, money/time rules. Escalated as DR-003 before the first migration (HIGH effort).
4. **ARCH-004** — `docs/architecture/STATE_MACHINES.md` + permission matrix: kitchen, delivery, payment, session transitions and which role may run each. Escalated as DR-004 (HIGH effort).

ARCH-003 and ARCH-004 can be drafted in parallel with ARCH-002 since they are docs only.
