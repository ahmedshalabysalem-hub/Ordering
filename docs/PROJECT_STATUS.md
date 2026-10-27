# Project Status

_Last updated: 2026-10-27_

## Phase
Phase 2 — Database and backend foundation.

## Current state
- Merged: PR #1 (docs, skeleton, CI), PR #2 (schema + migrations, ADR-007, ADR-008), PR #3 (AUTH-001 staff sign-in, lockout, admin bootstrap, ADR-009), PR #4 (AUTH-002 permission guards), PR #5 (TBL-001 tables + permanent QR codes), PR #6 (MENU-001 categories and products, ADR-011).
- MENU-002 (option groups such as size and extras, linked to products, server-side selection check) in REVIEW.
- The user delegated technical decisions and merges of green PRs to the Project Director (2026-10-27). Destructive or irreversible actions, production deploys, spending and real credentials still need the user.

## Completed
- DOC-001, ARCH-001..004, DB-001, AUTH-001, AUTH-002, TBL-001, MENU-001.

## Pending decisions
- None.

## Immediate priorities
1. Merge MENU-002.
2. ORD-001 — order creation (pricing, snapshots, idempotency, per-table daily numbering).
3. ORD-002 — table sessions.
