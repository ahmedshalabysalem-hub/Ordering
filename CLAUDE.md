# CLAUDE.md — Restaurant & Café QR Ordering and Management System

QR-based ordering and management for cafés and restaurants.

## Sources of truth
- `docs/PROJECT_STATUS.md` — current state and priorities (read first)
- `docs/TASK_BOARD.md` — tasks, owners, statuses
- `docs/DECISIONS.md` — approved decisions (binding)
- `docs/DECISION_REQUESTS.md` — pending decisions (not binding)
- `docs/SESSION_HANDOFF.md` — latest handoff
- `docs/SPEC.md` — product requirements baseline
Conversation history is supplementary; these files win.

## Non-negotiable rules
1. Every meaningful change has a task ID (see prefixes in docs/TASK_BOARD.md).
2. Project-level decisions (architecture, schema, API contracts, auth, payments, inventory, money math, dependencies) are escalated as a decision request; do not implement before approval.
3. Never claim tests passed, CI passed, a push succeeded, or a PR merged without observing it.
4. No direct commits to `main`; work on a branch and open a PR. The user approves merges.
5. Money is never stored or computed as floating point.
6. No secrets in the repo.
7. Medium effort by default; high effort for security, payments, inventory concurrency, migrations.
8. Update TASK_BOARD, PROJECT_STATUS and SESSION_HANDOFF when a task changes status.

## Commands
See README.md (Commands) and docs/TESTING.md. Before pushing: `pnpm lint && pnpm typecheck && pnpm test`, plus integration/E2E when DB or UI code changes.
