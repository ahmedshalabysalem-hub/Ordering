# Ordering

Restaurant & Café QR Ordering and Management System. Customers scan a table QR code, order from their phone, and staff handle the order through cashier, kitchen and admin screens.

Project status, plan and decisions live in `CLAUDE.md` and `docs/`.

## Stack

Next.js 16 (App Router, TypeScript) · PostgreSQL 16 · Drizzle ORM · Tailwind CSS · Vitest · Playwright. See `docs/adr/ADR-005-stack.md`.

## Getting started

Requirements: Node 22, pnpm 10, Docker (or a local PostgreSQL 16).

```bash
pnpm install
cp .env.example .env.local     # then set BETTER_AUTH_SECRET; BETTER_AUTH_URL is also the public URL in table QR codes
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

## Running the tests locally

```bash
export DATABASE_URL=postgres://ordering:ordering@localhost:5432/ordering_test   # name must end in _test; it is reset
export BETTER_AUTH_SECRET=any-local-test-secret-of-32-characters BETTER_AUTH_URL=http://localhost:3100
pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration
pnpm build && pnpm test:e2e
```

## Deployment

Production with Docker Compose (HTTPS proxy, backups and restore): `docs/DEPLOYMENT.md`.
What was built and tested, with the acceptance checklist: `docs/DELIVERY_REPORT.md`.

## Using the system

1. Sign in at `/login` with the bootstrap admin, then check **Admin → Settings** (currency can only change before the first order).
2. Add the menu (**Menu**, **Product options**), the **Tables**, and print each table's QR card.
3. Create staff accounts in **Users & roles** (cashier, kitchen) and captains in **Captains**.
4. Open **Cashier screen** and **Kitchen screen** on the devices at the counter and in the kitchen; guests order by scanning the table QR code.
