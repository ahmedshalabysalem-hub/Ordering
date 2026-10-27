# Session Handoff

_2026-10-27 — Project Director thread_

- State: TBL-001 on branch `claude/project-thread-vzn3gg`, PR pending. AUTH-002 merged (PR #4).
- Approved: ADR-000..010. Pending: none. Technical decisions are delegated to the Project Director (record as "APPROVED (delegated)").
- Tables: `src/server/tables/service.ts` (create/update/regenerate with audit via `src/server/audit.ts`, `resolveQrToken`), `qr.ts` (PNG/SVG). Admin pages `/admin/tables`, `/admin/tables/{id}`, `/admin/tables/{id}/print`; download `GET /api/admin/tables/{id}/qr?format=png|svg`. Public `/order/table/{token}`.
- Note: dynamic pages stream inside `<Suspense>`, so an unknown token renders the not-found page with HTTP 200. Next keeps the previous route mounted but hidden; in E2E prefer `getByRole` over `getByLabel` after client navigation.
- Verification: lint, typecheck, unit (17), integration (29), build and E2E (10) pass locally on `ordering_test`.
- Next action: MENU-001/002 (categories, products, modifiers; `menu.manage`).
