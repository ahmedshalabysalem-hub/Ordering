# Project Status

_Last updated: 2026-10-27_

## Phase
Phase 1 → 2 — architecture done for data; database foundation in review.

## Current state
- PR #1 merged: docs, decisions ADR-000..006, Next.js + PostgreSQL skeleton, CI.
- Data model approved (ADR-007, `docs/architecture/DATA_MODEL.md`).
- DB-001 (schema, migrations 0000–0001, constraint tests) in REVIEW.

## Completed
- DOC-001 (scope), ARCH-001 (stack), ARCH-002 (skeleton + CI), ARCH-003 (data model).

## Pending decisions
- None. Next: DR-004 (state machines + permission matrix, ARCH-004).

## Immediate priorities
1. Merge DB-001.
2. ARCH-004 — state machines + permissions (DR-004).
3. AUTH-001 — staff auth, lockout, admin bootstrap.
