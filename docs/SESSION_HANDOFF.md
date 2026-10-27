# Session Handoff

_2026-10-27 — Project Director thread_

- State: AUTH-002 on branch `claude/project-thread-vzn3gg`, PR pending. AUTH-001 merged (PR #3).
- Approved: ADR-000..009. Pending: none. Technical decisions are delegated to the Project Director (record as "APPROVED (delegated)").
- Auth: `src/server/auth/permissions.ts` (ADR-008 role map, `can`, `assertCan`, `AuthError`), `session.ts` (`authorize`, `requirePermission`, `requireStaff`, `authErrorResponse`). `GET /api/staff/me` returns roles and permissions.
- Verification: lint, typecheck, unit (17), integration (23), build and E2E (6) pass locally on `ordering_test`.
- Next action: TBL-001 (tables + permanent QR tokens + print cards, admin-only via `tables.manage`).
