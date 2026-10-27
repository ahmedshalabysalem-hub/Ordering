# Session Handoff

_2026-10-27 — Project Director thread_

- State: AUTH-001 on branch `claude/project-thread-vzn3gg`, PR pending.
- Approved: ADR-000..009. Pending: none. Technical decisions are delegated to the Project Director (record as "APPROVED (delegated)").
- Auth: `src/server/auth/` (Better Auth config + lockout hooks, session helpers, bootstrap). Migration 0002 adds the auth tables. `/login` and `/staff` pages exist (English only until the i18n task).
- Verification: lint, typecheck, unit, integration and E2E pass locally against PostgreSQL 16 (`ordering_test`).
- Next action: AUTH-002 (requireRole/permission guard from the ADR-008 matrix), then TBL-001.
