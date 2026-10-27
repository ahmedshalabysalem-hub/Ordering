# Project Status

_Last updated: 2026-10-27_

## Phase
Phase 1 → 2 — architecture done for data; database foundation in review.

## Current state
- PR #1 merged: docs, decisions ADR-000..006, Next.js + PostgreSQL skeleton, CI.
- Data model approved (ADR-007, `docs/architecture/DATA_MODEL.md`).
- DB-001 (schema, migrations 0000–0001, constraint tests) in REVIEW.

## Completed
- DOC-001 (scope), ARCH-001 (stack), ARCH-002 (skeleton + CI), ARCH-003 (data model), ARCH-004 (state machines + permissions).

## Pending decisions
- None.

## Immediate priorities
1. Merge DB-001.
2. AUTH-001 — staff auth, lockout, admin bootstrap.
3. AUTH-002 — server-side RBAC guard (ADR-008).
