# ADR-016 — Manual payment recording (PAY-001)

**Status:** APPROVED 2026-10-28 by the Project Director under the user's delegation of technical decisions. This ADR applies ADR-008 §3.

## Decision
- **What is recorded:** payments are recorded by staff. The app never processes cards.
  - "Card" means the cashier took the card on a separate terminal.
  - The optional reference (for example a POS slip number) is kept with the payment (SPEC §17).
- **Full payments only:** partial payments stay off in the MVP.
  - "Record payment" always pays the whole outstanding amount of one order.
  - The screen sends the amount it showed, and the server refuses with `CONFLICT` if the amount due has changed.
- **Pay whole table:** pays every unpaid order of the session that is not cancelled, with one method, in one transaction, each order getting its own payment row.
  - The screen sends the total it showed, which is checked the same way.
- **Concurrency:** the order row is locked and its `version` is checked, so two cashiers can never pay the same order twice.
- **Derived status:** `orders.paid_minor` (net) and `payment_status` are recomputed from the `payments` rows in the same transaction (`derivePaymentStatus`, pure integer math).
  - Each change writes an `order_events` row and an audit entry and publishes a live event.
- **Refunds:** admin only.
  - A refund needs a reason of 3 to 300 characters and is at most the net amount paid.
  - It goes back by the method of the last payment, unless a method is given.
  - The amount is typed as decimal text and parsed to minor units without floats (ADR-011).
- **Cancelled orders and cancelling:** cancelled orders cannot be paid. An order with net money paid must be refunded before it can be cancelled (ADR-015).

## Consequences
- Payment methods come from `payment_methods`, seeded with Cash and Card by the bootstrap. Managing them is part of ADM settings.
- Partial payments, split bills and tips are possible later without schema changes, but each needs its own decision.
