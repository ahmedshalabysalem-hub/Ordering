# Session Handoff

_2026-10-27 — Project Director thread_

- State: PR #1 merged. DB-001 (schema + migrations + constraint tests) on branch `claude/project-thread-vzn3gg`, PR pending.
- Approved: ADR-000..008. Pending: none.
- Schema: `src/server/db/schema.ts`; migrations in `drizzle/` (0000 init, 0001 audit-log insert-only trigger). Auth tables are not created yet (AUTH-001 maps the auth library onto `users`).
- Verification: lint, typecheck, unit, integration (constraint tests) run locally against PostgreSQL 16.
- Next action: AUTH-001 (staff auth, lockout, admin bootstrap), then AUTH-002 (RBAC guard per ADR-008).
