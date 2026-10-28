# Decisions

Index of approved decisions. Numbering: `ADR-NNN`. Substantial decisions have their own file in `docs/adr/`.

| ID | Title | Status | Date | Related |
|---|---|---|---|---|
| ADR-000 | Adopt the Master Operating Instructions as the project workflow | APPROVED | 2026-10-27 | — |
| ADR-001 | `docs/SPEC.md` (Master Project Prompt) is the product requirements baseline | APPROVED | 2026-10-27 | DOC-001 |
| ADR-002 | Single restaurant at launch, schema ready for multi-branch; no multi-tenant SaaS yet | APPROVED (spec §2) | 2026-10-27 | DOC-001 |
| ADR-003 | No payment gateway in MVP; manual payment recording only | APPROVED (spec §2, §17) | 2026-10-27 | — |
| ADR-004 | Permanent table QR codes: one token per table, never changed by orders or sessions; regeneration only as an explicit admin action; order tracking uses a separate token | APPROVED (spec §33) | 2026-10-27 | TBL-001, ORD-001, TEST-001 |
| [ADR-005](adr/ADR-005-stack.md) | Stack: Next.js + TypeScript monolith, PostgreSQL 16, Drizzle, Better Auth, SSE + LISTEN/NOTIFY, Tailwind/shadcn, next-intl, Vitest, Playwright, Docker Compose, GitHub Actions | APPROVED (delegated) | 2026-10-27 | ARCH-001 |
| [ADR-006](adr/ADR-006-business-defaults.md) | MVP business defaults; currency/timezone/tax are admin settings (seed EGP, Africa/Cairo) | APPROVED (delegated) | 2026-10-27 | DOC-001 |
| [ADR-007](architecture/DATA_MODEL.md) | Data model: UUID v7 keys, branch-scoped rows, integer minor-unit money, AR/EN columns, separate kitchen/delivery/payment statuses, snapshots on order lines, insert-only audit log | APPROVED (user) | 2026-10-27 | ARCH-003, DB-001 |
| [ADR-008](architecture/STATE_MACHINES.md) | State machines (kitchen, delivery, payment, session, assistance) and role permission matrix; refunds and post-preparation cancels are admin-only | APPROVED (user) | 2026-10-27 | ARCH-004, AUTH-002 |
| [ADR-009](adr/ADR-009-staff-auth.md) | Staff auth: Better Auth email/password, no sign-up, 12h DB sessions, lockout after 5 failures for 15 min, sign-in rate limit, CLI admin bootstrap | APPROVED (delegated) | 2026-10-27 | AUTH-001 |
| ADR-010 | Dependency `qrcode` (MIT) for server-side QR PNG/SVG; error correction Q; QR links use `BETTER_AUTH_URL` as the public base URL | APPROVED (delegated) | 2026-10-27 | TBL-001 |
| [ADR-011](adr/ADR-011-menu-images-and-prices.md) | Menu images on local disk behind a storage module (JPEG/PNG/WebP by signature, max 2 MB, served with nosniff); prices typed as decimal text and parsed to integer minor units without floats; deactivate instead of delete | APPROVED (delegated) | 2026-10-27 | MENU-001 |
| [ADR-012](adr/ADR-012-order-pricing-and-creation.md) | Order pricing (integer half-up, tax once per order, inclusive/exclusive, untaxed service charge) and one-transaction creation (table lock, per-table idempotency keys, session open, atomic daily number, price-change guard); public order API; `order_ref` unique per branch | APPROVED (delegated) | 2026-10-27 | ORD-001 |
| [ADR-013](adr/ADR-013-customer-app.md) | Customer app: in-repo AR/EN dictionaries instead of next-intl (amends ADR-005), language in a cookie, cart in localStorage with an other-table warning, idempotency key reused only for the same body, tracking by random token only, assistance dedup + cooldown | APPROVED (delegated) | 2026-10-28 | UI-001..005 |
| [ADR-014](adr/ADR-014-realtime.md) | Real-time: thin id-only events via pg_notify inside the writing transaction (delivered only on commit), one LISTEN per process, SSE streams for staff (branch-scoped, 10-min re-auth) and per tracking token (order-only, capped), reconnect re-reads state, polling fallback | APPROVED (delegated) | 2026-10-28 | RT-001 |
| [ADR-015](adr/ADR-015-operations.md) | Cashier and kitchen operations: versioned, audited transitions in `src/server/operations/`; cancel needs a reason (admin after preparation, refund first if paid); serving allowed without a captain (amends ADR-008 §2); captains admin; live cashier grid and kitchen display | APPROVED (delegated) | 2026-10-28 | OPS-001..004 |
