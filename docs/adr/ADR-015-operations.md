# ADR-015 — Cashier and kitchen operations (OPS-001..004)

**Status:** APPROVED 2026-10-28 by the Project Director under the user's delegation of technical decisions. This ADR applies and slightly amends ADR-008.

## Decision
- **Services:** all staff moves live in `src/server/operations/`.
  - Each one runs in a transaction and locks the order.
  - Each checks `version`, so of two simultaneous clicks only one wins and the other is told to refresh.
  - Each writes an `order_events` row, writes an audit entry where ADR-008 asks for one, and publishes a real-time event (ADR-014).
- **Kitchen:** follows ADR-008 §1 exactly.
  - `NEW → ACCEPTED → IN_PREPARATION → READY`, and `NEW → IN_PREPARATION` is also allowed.
  - Only staff with `kitchen.transition` can make these moves.
- **Cancel:** needs a reason of 3 to 300 characters.
  - A cashier can cancel before preparation. Once the order is preparing or ready, only an admin can.
  - An order with money recorded against it must be refunded first (PAY-001).
  - Cancelling closes the captain assignment.
  - The cancellation is audited.
- **Captains:** assign, reassign and unassign keep the history in `captain_assignments`. Only active captains of the branch can be chosen.
  - Captains are managed at `/admin/captains`, under `captains.manage`. They are deactivated, never deleted.
- **Serving (amends ADR-008 §2):** "Mark served" (`DELIVERED`) is allowed from `NOT_ASSIGNED` as well as `ASSIGNED`/`ACCEPTED`.
  - Small cafés often serve from the counter without captains, and forcing a fake captain would corrupt the history.
  - The order must still be `READY`.
- **Assistance:** each move (`acknowledge`, `resolve`, `cancel`) is one conditional update on the expected status, so two staff members cannot both handle the same request.
- **Screens:**
  - **Cashier (`/staff/cashier`):** a live table grid with the ADR-008 §6 colors, order details, captain choice, "mark served", cancel, and start closing, reopen or close for the table. Assistance alerts are shown at the top.
  - **Kitchen (`/staff/kitchen`):** large, high-contrast tickets in three columns (New, In preparation, Ready to serve).
    - The age of a ticket is shown in amber after the branch's `prep_warn_minutes` and in red after `prep_overdue_minutes`.
    - There are sold-out switches for products.
  - Both screens re-read their data on every live event.
  - A sound alert can be switched on. Browsers only allow audio after a click, and the setting `new_order_sound` can turn it off for the branch.
- **Language:** staff screens are English-only for the MVP, as ADR-013 notes.

## Consequences
- Payment recording (PAY-001) adds the "Record payment" action to the cashier's order card.
- A captain login and a captain screen remain future work (ADR-008).
