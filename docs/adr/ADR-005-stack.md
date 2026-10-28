# ADR-005 — Architecture and technology stack (from DR-001)

- **Requesting task:** ARCH-001
- **Requesting thread:** Project Director
- **Question:** Which stack, database, real-time mechanism and hosting model do we build the MVP on?
- **Context:** The repo is empty, so there is nothing to stay compatible with. The spec (`docs/SPEC.md`) requires: four UIs (customer, cashier, KDS, admin), AR/EN with RTL, server-enforced RBAC, transactional orders with idempotency and atomic numbering, real-time updates with a polling fallback, manual payments, audit log, a modular monolith ready for multi-branch later.

### Verified facts
- Repo `ahmedshalabysalem-hub/Ordering` has no commits, branches or CI (checked 2026-10-27).
- Dev environment has Node 22, pnpm 10, Docker 29, PostgreSQL 16 client.

### Assumptions (unverified)
- One restaurant, one branch at launch; low to moderate traffic (tens of tables, a few staff screens).
- Ahmed can run a small VPS or a managed Node host plus managed Postgres.

### Options

**A. Next.js full-stack monolith + PostgreSQL (recommended)**
- Next.js (App Router, TypeScript) serves all four UIs and the API (route handlers / server actions).
- PostgreSQL 16, Drizzle ORM + SQL migrations (keeps constraints, transactions and row locks explicit).
- Auth: Better Auth (email/password, DB sessions, httpOnly cookies, rate limiting) + our own RBAC checks in every server action.
- Real-time: Server-Sent Events from the Node server, fed by Postgres `LISTEN/NOTIFY` published after commit; clients refetch on reconnect, with polling fallback.
- UI: Tailwind CSS + shadcn/ui (logical properties for RTL), next-intl for AR/EN. _(Amended by ADR-013: the customer app uses typed in-repo dictionaries instead of next-intl.)_
- Tests: Vitest (unit + integration against real Postgres), Playwright (E2E scenarios A–H).
- Deploy: Docker Compose (app + Postgres) on a VPS; GitHub Actions CI.
- Pros: one codebase and language, one deploy, no extra infra, fits every spec requirement.
- Cons: SSE needs a long-running Node server (not serverless/edge); must keep domain logic in its own module, not scattered in pages.

**B. Supabase (Postgres + Auth + Realtime + RLS) + Next.js frontend**
- Pros: managed auth, realtime and storage; less backend code.
- Cons: security relies on getting RLS right on every table (spec flags this); order creation, numbering and idempotency still need server functions; vendor lock-in; harder to test locally end to end.

**C. Separate API (NestJS) + React SPA(s) + Postgres + Socket.IO**
- Pros: strong backend structure, clear API boundary for a future mobile app.
- Cons: two codebases, two deploys, more boilerplate; slower to first working flow; no current requirement for a separate API.

### Recommendation
Option A. It is the simplest option that meets all requirements, and the domain layer (orders, sessions, payments, numbering) stays in plain TypeScript modules that could move behind a separate API later if needed. Data model includes `restaurant_id` / `branch_id` columns from day one (single row each at launch) so multi-branch doesn't need a rewrite.

### Risks
- SSE behind some proxies needs buffering disabled; mitigated by the polling fallback.
- Better Auth is younger than Auth.js; mitigated by keeping RBAC in our own code and sessions in our DB.
- Hosting must support a persistent Node process (rules out pure Vercel serverless for real-time).

### Dependencies
Blocks ARCH-002 (skeleton/CI), ARCH-003 (schema) and everything after.

### Testing
CI runs lint, typecheck, Vitest against a Postgres service container, Playwright E2E, and `next build`.

### Approval required
Approve Option A (or pick B/C).

**Status:** APPROVED 2026-10-27 — Option A. Approved by the Project Director under the user's explicit delegation ("خد القرارات المناسبة والصح").
