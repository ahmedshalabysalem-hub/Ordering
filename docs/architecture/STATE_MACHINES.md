# State Machines and Permissions (ARCH-004, ADR-008)

Status: **APPROVED** 2026-10-27 by the user (DR-004 → ADR-008). Based on `docs/SPEC.md` §4, §9.4, §10.2, §11, §17 and ADR-006/007.
Every transition runs on the server in a transaction, checks the role, uses `version` for optimistic concurrency, writes an `order_events` row (and an `audit_logs` row where noted), then publishes a real-time event after commit.

## 1. Kitchen status (`orders.kitchen_status`)

| From | To | Who | Notes |
|---|---|---|---|
| — | NEW | Customer (public submit) | Created with the order |
| NEW | ACCEPTED | KITCHEN, ADMIN | Stops the cashier "new order" animation. Needs a responsible chef (ADR-018) |
| NEW, ACCEPTED | IN_PREPARATION | KITCHEN, ADMIN | NEW → IN_PREPARATION allowed (UI may merge the two steps). Needs a responsible chef (ADR-018) |
| IN_PREPARATION | READY | KITCHEN, ADMIN | READY only from IN_PREPARATION |
| NEW, ACCEPTED | CANCELLED | CASHIER, ADMIN | Reason required; audited |
| IN_PREPARATION, READY | CANCELLED | ADMIN | Reason required; audited |

Terminal: READY (for kitchen), CANCELLED. No other transitions.

## 2. Delivery status (`orders.delivery_status`)

| From | To | Who | Notes |
|---|---|---|---|
| NOT_ASSIGNED | ASSIGNED | CASHIER, ADMIN | Creates `captain_assignments` row; captain must be active; audited |
| ASSIGNED | ASSIGNED (reassign) | CASHIER, ADMIN | Closes current assignment (`unassigned_at`), opens a new one; audited |
| ASSIGNED | ACCEPTED | CAPTAIN (future), CASHIER, ADMIN | Captain login is not in the MVP |
| ASSIGNED, ACCEPTED | DELIVERED | CAPTAIN (future), CASHIER, ADMIN | Only when kitchen status is READY |
| ASSIGNED | NOT_ASSIGNED | CASHIER, ADMIN | Unassign; closes current assignment |

Delivery does not change kitchen status, and READY never auto-delivers.

## 3. Payment status (`orders.payment_status`), derived

Payment status is never set directly. It is recomputed in the same transaction as each `payments` insert:

- net = sum(PAYMENT) − sum(REFUND), stored in `orders.paid_minor`
- UNPAID: net = 0 and no refunds; PAID: net ≥ total; PARTIALLY_PAID: 0 < net < total (only reachable if partial payments are enabled, off in MVP);
- REFUNDED: refunds > 0 and net = 0; PARTIALLY_REFUNDED: refunds > 0 and 0 < net < total.

| Action | Who | Rules |
|---|---|---|
| Record payment | CASHIER, ADMIN | Amount must equal outstanding while partial payments are off; method must be active; currency = order currency; audited |
| Record refund | ADMIN | Reason required; refund ≤ net paid; audited |
| Cancelled orders | — | Cannot receive payments |

## 4. Table session (`table_sessions.status`)

AVAILABLE is derived: no non-CLOSED session for the table.

| From | To | Who | Rules |
|---|---|---|---|
| (none) | OPEN | Customer (first order) | Created inside the order transaction; the partial unique index prevents two |
| OPEN | CLOSING | CASHIER, ADMIN | Optional step that blocks new customer orders while the cashier settles |
| CLOSING | OPEN | CASHIER, ADMIN | Cancel closing |
| OPEN, CLOSING | CLOSED | CASHIER, ADMIN | Every order is CANCELLED or (PAID and, under policy ALL_PAID_AND_DELIVERED, DELIVERED); pending assistance requests are resolved or cancelled; audited. Concurrent close → version conflict error |

New customer orders: allowed when the session is OPEN or none exists; rejected while CLOSING. The table QR token is never touched (ADR-004).

## 5. Assistance requests

| From | To | Who |
|---|---|---|
| — | PENDING | Customer (rate-limited, one pending per table) |
| PENDING | ACKNOWLEDGED | CASHIER, ADMIN (CAPTAIN later) |
| PENDING, ACKNOWLEDGED | RESOLVED | CASHIER, ADMIN (CAPTAIN later) |
| PENDING | CANCELLED | CASHIER, ADMIN, or session close |

## 6. Table colors on the cashier grid (derived, never stored)

| Condition (first match wins) | Color | Label |
|---|---|---|
| No open session | Yellow | Available |
| Any order NEW and not acknowledged | Yellow/orange blink | New order |
| Any order READY and not DELIVERED | Green | Ready |
| Any order ACCEPTED or IN_PREPARATION | Orange | In preparation |
| Session OPEN, all orders delivered/cancelled | Yellow + "awaiting payment" badge if unpaid | Seated |

Pending assistance adds a separate badge.

## 7. Permission matrix (code map, ADR-007)

| Permission | ADMIN | CASHIER | KITCHEN | CAPTAIN (future) |
|---|---|---|---|---|
| tables.manage, qr.regenerate | ✓ | | | |
| menu.manage (categories, products, modifiers, prices, availability) | ✓ | | | |
| product.toggle_availability | ✓ | ✓ | ✓ | |
| users.manage, roles.assign | ✓ | | | |
| captains.manage, suppliers.manage, settings.manage | ✓ | | | |
| audit.view | ✓ | | | |
| orders.view_operational (live grid, details) | ✓ | ✓ | | assigned only |
| kitchen.view, kitchen.transition | ✓ | | ✓ | |
| orders.cancel (before preparation) | ✓ | ✓ | | |
| orders.cancel (after preparation) | ✓ | | | |
| captain.assign | ✓ | ✓ | | |
| delivery.confirm | ✓ | ✓ | | assigned only |
| payments.record | ✓ | ✓ | | |
| payments.refund | ✓ | | | |
| session.close | ✓ | ✓ | | |
| assistance.handle | ✓ | ✓ | | ✓ |
| orders.history | ✓ | ✓ (last 7 days) | completed tickets (today) | |
| reports.view | ✓ | operational only | | |

Kitchen can toggle product availability (e.g. "out of croissants"), approved with ADR-008.
