# Session Handoff

_2026-10-27 — Project Director thread_

- State: ORD-001 on branch `claude/project-thread-vzn3gg`, PR pending. MENU-002 merged (PR #7).
- Approved: ADR-000..012. Pending: none. Technical decisions are delegated to the Project Director (record as "APPROVED (delegated)").
- Menu: `src/server/menu/service.ts` (categories, products, availability; audited; deactivate, never delete), `src/server/money.ts` (decimal text ↔ integer minor units, no floats), `src/server/media/` (image validation by signature, local-disk storage under `UPLOAD_DIR`), `GET /api/media/{file}`. Admin pages under `/admin/menu`.
- Modifiers: `src/server/menu/modifiers.ts` (groups with min/max choices, options with extra price, product links; audited) and `src/server/menu/selection.ts` (`checkModifierSelection`, pure, for ORD-001 to validate a customer's choices and total the extras). Pages `/admin/menu/options`, `/admin/menu/options/{id}`; product edit page links groups.
- Orders (ADR-012): `src/server/orders/pricing.ts` (pure integer pricing), `create.ts` (`quoteOrder`, `createOrder`: table row lock, idempotency per table, session open, daily number, snapshots, `PRICES_CHANGED` guard), public routes `POST /api/public/orders/quote` and `POST /api/public/orders` (needs `Idempotency-Key`), in-memory rate limit `src/server/rate-limit.ts`. Migration 0003 makes `order_ref` unique per branch.
- Staff permission helper: `branchFor(staff, permission)` in `permissions.ts` returns the branch where the permission is held (used by tables and menu services).
- Staff forms use `useKeptForm` (`src/app/_components/use-kept-form.ts`) so a server-side validation error keeps what was typed.
- Notes: dynamic pages stream inside `<Suspense>`, so an unknown QR token renders the not-found page with HTTP 200. Next keeps the previous route mounted but hidden; in E2E prefer `getByRole` over `getByLabel` after client navigation, and wait for the new page's heading after clicking a link.
- Verification: lint, typecheck, unit (36), integration (52), build and E2E (16) pass locally on `ordering_test`.
- tsconfig target is ES2022 (BigInt literals). If a stale `tsconfig.tsbuildinfo` reports BigInt errors, delete it.
- Next action: ORD-002 (session CLOSING/CLOSED with version check per DATA_MODEL rule 4, staff order queries), then the customer UI (UI-001..005).
