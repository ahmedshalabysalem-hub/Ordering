# ADR-012 — Order pricing and creation (ORD-001)

**Status:** APPROVED 2026-10-27 by the Project Director under the user's delegation of technical decisions. This is high-effort work under CLAUDE.md rule 7, because it covers money math and concurrency.

## Pricing (`src/server/orders/pricing.ts`, pure)
- **Inputs:** the client sends only product IDs, option IDs, quantities and notes. Every price comes from the current `products` and `modifier_options` rows (DATA_MODEL rule 2).
- **Lines:** `line_total = (unit_price + sum of option extras) × quantity`. This matches the `order_items_line_total` CHECK.
- **Subtotal:** the sum of the line totals. Discount is 0 in the MVP.
- **Tax:** the active `tax_rates` of the branch are added into one rate in basis points, and tax is computed once per order on the subtotal.
  - **Tax-exclusive prices** (the seed default): `tax = round_half_up(subtotal × bps / 10000)`.
  - **Tax-inclusive prices:** the menu prices already contain tax. In that case `net = round_half_up(gross × 10000 / (10000 + bps))`, `tax = gross − net`, and `subtotal_minor` stores the net amount. This keeps the CHECK `total = subtotal − discount + tax + service`, and the customer still pays the menu price.
- **Service charge:** `service = round_half_up(net subtotal × service_bps / 10000)`. It is not taxed in the MVP, and it is off by default (ADR-006).
- **Arithmetic:** all intermediate products use `BigInt`, so large amounts cannot lose precision. Half-up rounding is done on non-negative integers, and there is no floating point anywhere.

## Creation (`src/server/orders/create.ts`), one transaction
1. **Resolve the table** from the QR token with `SELECT … FOR UPDATE`. This lock serialises every order for that table, which covers session creation, numbering and idempotency. An inactive or unknown table is refused.
2. **Idempotency:** the client sends an `Idempotency-Key` (16–64 characters) with each submit.
   - Keys are scoped per table (`order:{tableId}`) and stored with a SHA-256 hash of the request.
   - The same key with the same request returns the original order and creates nothing.
   - The same key with a different request returns 409.
3. **Session:** the order joins the table's open session. If none exists, a new OPEN session is created. While the session is CLOSING, orders are refused (ADR-008 §4).
4. **Validation:** each product must be active, available, in an active category and in the table's branch. Option choices must pass `checkModifierSelection` (MENU-002). Problems come back as a list, so the customer screen can point at the exact item.
5. **Price-change guard (SPEC §6.5):** the client may send `expectedTotalMinor`. If it differs from the server total, the order is refused with `PRICES_CHANGED` and the fresh quote, so the customer confirms the new total before resubmitting.
6. **Number:**
   - `business_date` is today in the branch timezone. The sequence comes from an atomic upsert on `order_counters (table_id, business_date)`.
   - `order_ref = YYYYMMDD-T{table number, 3 digits}-{seq, 4 digits}` (ADR-006).
   - If a renumbered table would repeat an existing reference that day, the next sequence is taken.
7. **Insert:** the order, its items and its option snapshots (names and prices) are inserted, along with an `ORDER_CREATED` event and the idempotency record.
   - The tracking token is a new random 32-character token, separate from the QR token (ADR-004).
   - Real-time `NOTIFY` is added by RT-001.

## Public API
- `POST /api/public/orders/quote` prices a cart without writing anything.
- `POST /api/public/orders` creates the order. It needs the `Idempotency-Key` header and returns `201` with `{ orderId, orderRef, trackingToken, totals }`.
- Errors are JSON `{ code, message, problems? }`:
  - `400` for invalid input.
  - `404` for an unknown table.
  - `409` for `TABLE_INACTIVE`, `SESSION_CLOSING`, `ITEMS_UNAVAILABLE`, `INVALID_OPTIONS`, `PRICES_CHANGED` and `IDEMPOTENCY_CONFLICT`.
  - `429` when the rate limit is hit.
- **Rate limit:** 10 order submissions per minute per table and 60 quotes per minute per table. It is kept in memory, like the sign-in limit (ADR-009).

## Schema change
- `order_ref` was unique across all branches. It is now unique per branch: `UNIQUE (branch_id, order_ref)`, in migration 0003 (an amendment to ADR-007).
- The reference is a human-facing daily label. Customers track an order with `tracking_token` and staff work with the order id, so two branches can both have a `T007-0001` today without clashing (ADR-002 keeps multi-branch possible).
- If a renumbered table meets an existing reference in its branch, the next sequence is taken. After 20 tries the order fails loudly.
