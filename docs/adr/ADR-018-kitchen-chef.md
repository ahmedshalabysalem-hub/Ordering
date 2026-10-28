# ADR-018 — Responsible chef on kitchen orders (OPS-005)

**Status:** APPROVED 2026-10-28 by the Project Director under the user's delegation of technical decisions (DR-005). Amends ADR-008 §1 and ADR-015 (kitchen moves).

## Request (DR-005)
The owner asked (2026-10-28) that, as soon as an order reaches the kitchen, a chef is picked from a list the admin keeps (like captains). The order cannot move to preparation without a responsible chef, and the chef's name shows on the cashier screen and in reports.

## Verified facts
- Kitchen moves are `NEW → ACCEPTED → IN_PREPARATION → READY` (and `NEW → IN_PREPARATION`) in `moveKitchenStatus` (`src/server/operations/orders.ts`), one row lock and version check per move.
- The kitchen works per order (one ticket per order); there is no per-item kitchen ticket.
- Captains are a per-branch list with deactivate-not-delete (`captains`, `/admin/captains`), and there is no captain login.

## Options
1. **`chefs` table + nullable `orders.chef_id`; the service requires a chef on any move out of NEW (recommended).** One column, one join, mirrors captains.
2. Per-item chef. Rejected: the kitchen has no per-item tickets, so it adds UI and schema for no current need.
3. Chef assignment history table (like `captain_assignments`). Rejected for now: the chef changes rarely; each change is already kept in `order_events.data`.
4. Chefs as user accounts with a KITCHEN login. Rejected: one shared kitchen screen is the current setup; the owner asked for a picked name, not separate logins.

## Decision
- **Schema (migration `0004_chefs`, additive only):** `chefs (id, branch_id, name, phone, is_active, created_at, updated_at)` and `orders.chef_id uuid null references chefs(id)`, indexed. Existing orders keep `chef_id = null` and stay valid.
- **Rule (server-side):** a move to `ACCEPTED` or `IN_PREPARATION` needs a chef: either the order already has one or the move carries `chefId`. Otherwise the move fails with `INVALID` and nothing changes.
  - `chefId` must be an active chef of the same branch.
  - The chef can be chosen or changed only while the order is `NEW` or `ACCEPTED`; after that it is fixed.
  - `IN_PREPARATION → READY` needs no chef, so orders already preparing before this change can still be finished.
  - The pick is recorded on the `KITCHEN_STATUS` order event (`chefId`, `chefName`, `previousChefId`).
  - Not a database CHECK, because historical orders past NEW have no chef.
- **Admin:** `/admin/chefs` (add, edit, deactivate; audited `CHEF_CREATED` / `CHEF_UPDATED`) under a new permission `chefs.manage`, held by ADMIN only.
- **Kitchen screen:** NEW and ACCEPTED tickets show a "Chef responsible" list of active chefs; Accept and Start preparing stay disabled until one is chosen. Later tickets show "Chef: name".
- **Shown in:** cashier order card, admin order history list and order detail, and a "Chefs" report section (orders, reached ready, average placed → ready; cancelled orders excluded) with CSV `section=chefs`.

## Risks
- Deactivating a chef does not touch orders already assigned to them; their name stays on those orders.
- Two chefs with the same name are allowed, as with captains; the report groups by chef id.

## Testing
Integration: no move out of NEW without a chef (with and without `null`), other-branch, unknown and inactive chefs refused, change allowed only before preparation, legacy preparing order can be readied, admin-only management with audit, chef on kitchen and cashier boards, report, history and CSV. Unit: `chefs.manage` is admin-only. E2E: admin adds a chef, kitchen buttons are disabled until a chef is picked, the cashier sees the chef, the order detail shows it.
