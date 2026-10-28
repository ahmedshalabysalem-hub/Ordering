# ADR-013 — Customer ordering app (UI-001..005)

**Status:** APPROVED 2026-10-28 by the Project Director under the user's delegation of technical decisions.

## Context
SPEC §6 and §7.1 ask for a public, mobile-first ordering page per table QR code. It must be fully bilingual (Arabic RTL and English LTR), keep a cart across refreshes, never trust browser prices, avoid duplicate orders, track orders securely and offer an assistance button. ADR-005 named next-intl for AR/EN.

## Decision

### Language (amends ADR-005)
- **No next-intl for now.** The customer UI uses typed in-repo dictionaries in `src/i18n/` (`en.ts` is the source; `ar.ts` must have the same keys, which the type and a unit test enforce).
  - The menu content is already bilingual per row (`name_ar`/`name_en`), so only about a hundred UI strings need a dictionary.
  - next-intl is built around locale routing and request config. That adds a dependency and does not fit the token-based URLs, and its support for Next 16 Cache Components is not proven.
  - next-intl can still be adopted for the admin UI later without changing the customer pages.
- **Choice and persistence:** the language is kept in a `lang` cookie (`ar` or `en`, one year, `SameSite=Lax`).
  - With no cookie, the branch's `default_language` is used.
  - The server reads the cookie, so the first paint already has the right `lang` and `dir`.
  - Switching language changes the page at once on the client, because the page holds both languages, and then writes the cookie.
  - The language never changes the currency (SPEC §6.2).
- **Fallback:** names are required in both languages. When a description is missing, the other language's description is shown, instead of an empty field.
- Numbers and prices use Western digits in both languages (`ar-EG-u-nu-latn`), to match printed menus and receipts.

### Menu (UI-001)
- `getPublicMenu(branchId)` returns only what the page needs:
  - Active categories with their active products, in the configured order. Sold-out products are shown as sold out, not hidden.
  - Active modifier groups with their options. Unavailable options are shown disabled.
- No SKU, cost, prep station or other internal fields are returned.
- The menu is read fresh on each page load, so admin changes show up immediately (SPEC §6.3).

### Cart (UI-003)
- The cart lives in `localStorage` under one key and remembers which QR token it belongs to.
  - It holds only product IDs, option IDs, quantities and notes. Prices on the cart screen come from the server quote API (ADR-012).
  - The running total on the cart bar is only an estimate from the menu that was loaded. The checkout total is always the server quote.
- **Different table:** when a cart from another table is found, the page shows a warning with two explicit choices: move the items to this table, or start a new cart (SPEC §6.5). The old cart is never submitted silently.
- Adding the same product with the same options and note again increases the quantity of that line. Different options make a new line.

### Submit (UI-004)
- Each submit sends an `Idempotency-Key` that is stored with the cart together with the exact request body.
  - A retry of the same body, for example after a network error or a double tap, reuses the key, so the server returns the original order.
  - Any change to the cart or the expected total makes a new key.
- `expectedTotalMinor` is the total from the quote the customer reviewed.
  - On `PRICES_CHANGED`, the new quote is shown and the customer must confirm the new total before resubmitting.
  - Unavailable items and option problems are shown on the affected cart lines.
- Success is shown only after the server returns `201` (SPEC §6.7). The cart is then cleared, and the tracking token is remembered in `localStorage` for the "My orders" list on that table.

### Tracking (UI-005)
- `/order/track/{trackingToken}` shows the receipt from SPEC §7.1:
  - The restaurant, order reference, table number, and date and time in the branch timezone.
  - The items, options, prices, subtotal, tax, service charge and total.
  - The order status, with the payment status shown separately and labelled as "not a payment receipt".
- **Access:** only the 32-character random tracking token gives access. The table number, order reference and order ID give none.
  - The page is `noindex` and sends `Referrer-Policy: no-referrer`.
  - It shows no staff names, internal notes or other orders.
- The page refreshes itself every 15 seconds while the order is not final. RT-001 replaces this with server-sent events and keeps polling as the fallback.

### Assistance (UI-005)
- `POST /api/public/assistance` with `{ qrToken }` runs `requestAssistance`, which locks the table row and then:
  - Refuses unknown or inactive tables.
  - If the table already has a PENDING request, returns that request (`deduplicated: true`) instead of creating another. The unique partial index enforces this too.
  - If the last request was less than `assistance_cooldown_seconds` ago, refuses with `429 ASSISTANCE_COOLDOWN` and `retryAfterSeconds`.
  - Otherwise creates a PENDING request linked to the table's open session, if there is one.
- The answer is `{ status, createdAt, deduplicated }`. No history and no other table's data is returned.
- There is also an in-memory rate limit of 5 requests per minute per table (same caveat as ADR-012). The button is disabled while a request is in flight.
- Real-time staff notification is added by RT-001, and staff acknowledge and resolve requests in OPS.

## Consequences
- There is no new dependency.
- The customer pages render dynamically, because they read the cookie and the token.
- The admin UI stays English-only until ADM work decides otherwise.
