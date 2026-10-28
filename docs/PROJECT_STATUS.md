# Project Status

_Last updated: 2026-10-28_

## Phase
Phase 6 — Testing and hardening.

## Current state
- Merged: PR #1 (docs, skeleton, CI), PR #2 (schema + migrations, ADR-007, ADR-008), PR #3 (AUTH-001 staff sign-in, lockout, admin bootstrap, ADR-009), PR #4 (AUTH-002 permission guards), PR #5 (TBL-001 tables + permanent QR codes), PR #6 (MENU-001 categories and products, ADR-011), PR #7 (MENU-002 option groups), PR #8 (ORD-001 customer order creation, ADR-012), PR #9 (ORD-002 table sessions and cashier table overview), PR #10 (UI-001..005 customer app, ADR-013), PR #11 (RT-001 live updates, ADR-014), PR #12 (OPS-001..004 cashier and kitchen screens, ADR-015), PR #13 (PAY-001 payments, ADR-016), PR #14 (ADM-001..006 admin area, ADR-017).
- TEST-001..003 (SPEC §24.3 scenarios A–H end to end, coverage map) in REVIEW.
- The user delegated technical decisions and merges of green PRs to the Project Director (2026-10-27). Destructive or irreversible actions, production deploys, spending and real credentials still need the user.

## Completed
- DOC-001, ARCH-001..004, DB-001, AUTH-001, AUTH-002, TBL-001, MENU-001, MENU-002, ORD-001, ORD-002, UI-001..005, RT-001, OPS-001..004, PAY-001, AUD-001, ADM-001..006.

## Pending decisions
- None.

## Immediate priorities
1. Merge TEST-001..003.
2. DOC-002 (setup and deployment docs, delivery report).

## Known follow-ups
- Orphaned menu images are not cleaned up yet.
- Public rate limits are in memory, so they only work with one app instance (ADR-009, ADR-012).
- Reports group money by the order's business date; a cash-drawer report by payment time is a possible follow-up (ADR-017).
- Unknown QR or tracking tokens show the not-found page with HTTP 200, because the pages stream.
