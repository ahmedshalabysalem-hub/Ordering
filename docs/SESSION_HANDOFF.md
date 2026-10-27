# Session Handoff

_2026-10-27 — Project Director thread_

- State: MENU-001 on branch `claude/project-thread-vzn3gg`, PR pending. TBL-001 merged (PR #5).
- Approved: ADR-000..011. Pending: none. Technical decisions are delegated to the Project Director (record as "APPROVED (delegated)").
- Menu: `src/server/menu/service.ts` (categories, products, availability; audited; deactivate, never delete), `src/server/money.ts` (decimal text ↔ integer minor units, no floats), `src/server/media/` (image validation by signature, local-disk storage under `UPLOAD_DIR`), `GET /api/media/{file}`. Admin pages under `/admin/menu`.
- Staff permission helper: `branchFor(staff, permission)` in `permissions.ts` returns the branch where the permission is held (used by tables and menu services).
- Staff forms use `useKeptForm` (`src/app/_components/use-kept-form.ts`) so a server-side validation error keeps what was typed.
- Notes: dynamic pages stream inside `<Suspense>`, so an unknown QR token renders the not-found page with HTTP 200. Next keeps the previous route mounted but hidden; in E2E prefer `getByRole` over `getByLabel` after client navigation.
- Verification: lint, typecheck, unit (25), integration (35), build and E2E (13) pass locally on `ordering_test`.
- Next action: MENU-002 (modifier groups and options, linked to products).
