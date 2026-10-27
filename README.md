# Ordering

Restaurant & Café QR Ordering and Management System. Customers scan a table QR code, order from their phone, and staff handle the order through cashier, kitchen and admin screens.

Project status, plan and decisions live in `CLAUDE.md` and `docs/`.

## Stack

Next.js 16 (App Router, TypeScript) · PostgreSQL 16 · Drizzle ORM · Tailwind CSS · Vitest · Playwright. See `docs/adr/ADR-005-stack.md`.

## Getting started

Requirements: Node 22, pnpm 10, Docker (or a local PostgreSQL 16).

```bash
pnpm install
cp .env.example .env.local     # then set BETTER_AUTH_SECRET
docker compose up -d db        # PostgreSQL on localhost:5432 (creates `ordering` and `ordering_test`)
pnpm db:migrate                 # apply migrations (reads DATABASE_URL from .env.local)
pnpm admin:bootstrap --email you@example.com --name "Your Name"   # first admin, once
pnpm dev                       # http://localhost:3000, health check at /api/health
```

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Development server |
| `pnpm build` / `pnpm start` | Production build / serve |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | Generate route types and run `tsc` |
| `pnpm test` | Unit tests |
| `pnpm test:integration` | Integration tests (needs `DATABASE_URL`) |
| `pnpm test:e2e` | Playwright E2E against the production build (run `pnpm build` first) |
| `pnpm db:generate` / `pnpm db:migrate` | Create / apply Drizzle migrations (`drizzle/`) |
| `pnpm admin:bootstrap` | Create the first administrator (refuses once one exists); password via prompt or `BOOTSTRAP_ADMIN_PASSWORD` |

See `docs/TESTING.md` for the test strategy.
