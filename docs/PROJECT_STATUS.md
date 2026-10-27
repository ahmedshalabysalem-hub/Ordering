# Project Status

_Last updated: 2026-10-27_

## Phase
Phase 1 — Assessment and architecture.

## Current state
- Product spec stored as `docs/SPEC.md` (ADR-001), including permanent table QR codes (ADR-004).
- Stack approved: Next.js + PostgreSQL monolith (ADR-005). Business defaults approved (ADR-006).
- ARCH-002 (skeleton + CI) in REVIEW as PR #1: lint, typecheck, unit, integration, build and E2E pass locally; CI result pending.

## Completed
- Repository inspection, DOC-001 (scope), ARCH-001 (stack).

## Pending decisions
- None. Next: DR-003 (data model), DR-004 (state machines + permissions).

## Immediate priorities
1. ARCH-002 — skeleton + CI green.
2. ARCH-003 / ARCH-004 — data model and state machines (HIGH effort, escalate before first migration).
