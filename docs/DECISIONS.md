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
