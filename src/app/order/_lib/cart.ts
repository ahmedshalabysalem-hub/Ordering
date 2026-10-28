// Customer cart (UI-003, ADR-013). Pure functions over a plain object kept in localStorage. The cart
// holds ids, quantities and notes only; prices shown at checkout come from the server quote.

export const MAX_QUANTITY = 50;
export const MAX_LINES = 50;

export type CartLine = { id: string; productId: string; optionIds: string[]; quantity: number; note: string };

export type Cart = {
  v: 1;
  qrToken: string;
  tableNumber: number | null;
  lines: CartLine[];
  customerNote: string;
  /** The last submitted body and its idempotency key, reused only for the exact same body. */
  pending: { key: string; body: string } | null;
};

export type OrderBody = {
  qrToken: string;
  items: { productId: string; quantity: number; optionIds: string[]; note?: string }[];
  customerNote?: string;
  expectedTotalMinor?: number;
};

/** Menu prices the cart bar uses for its estimate. */
export type PriceBook = Map<string, { priceMinor: number; options: Map<string, number> }>;

export const emptyCart = (qrToken: string, tableNumber: number | null): Cart => ({
  v: 1,
  qrToken,
  tableNumber,
  lines: [],
  customerNote: "",
  pending: null,
});

const sameChoice = (a: Omit<CartLine, "id" | "quantity">, b: Omit<CartLine, "id" | "quantity">) =>
  a.productId === b.productId && a.note === b.note && a.optionIds.join() === b.optionIds.join();

const clampQuantity = (q: number) => Math.min(MAX_QUANTITY, Math.max(0, Math.trunc(q)));

/** Adds a line, or raises the quantity of an identical one (same product, options and note). */
export function addLine(cart: Cart, line: Omit<CartLine, "id">, newId: () => string): Cart {
  const normalised = { ...line, optionIds: [...line.optionIds].sort(), note: line.note.trim() };
  const existing = cart.lines.find((l) => sameChoice(l, normalised));
  if (existing) return setQuantity(cart, existing.id, existing.quantity + normalised.quantity);
  if (cart.lines.length >= MAX_LINES) return cart;
  const quantity = clampQuantity(normalised.quantity);
  if (quantity === 0) return cart;
  return { ...cart, pending: null, lines: [...cart.lines, { ...normalised, id: newId(), quantity }] };
}

/** Sets a line's quantity; zero removes it. */
export function setQuantity(cart: Cart, lineId: string, quantity: number): Cart {
  const q = clampQuantity(quantity);
  const lines = q === 0 ? cart.lines.filter((l) => l.id !== lineId) : cart.lines.map((l) => (l.id === lineId ? { ...l, quantity: q } : l));
  return { ...cart, pending: null, lines };
}

export const removeLine = (cart: Cart, lineId: string): Cart => setQuantity(cart, lineId, 0);

export const setCustomerNote = (cart: Cart, customerNote: string): Cart => ({ ...cart, pending: null, customerNote: customerNote.slice(0, 500) });

/** Moves a cart found for another table to this one (the customer's explicit choice). */
export const moveToTable = (cart: Cart, qrToken: string, tableNumber: number | null): Cart => ({ ...cart, qrToken, tableNumber, pending: null });

export const itemCount = (cart: Cart) => cart.lines.reduce((n, l) => n + l.quantity, 0);

/** The request body for the quote and order APIs. Never contains a price. */
export function toOrderBody(cart: Cart, expectedTotalMinor?: number): OrderBody {
  const note = cart.customerNote.trim();
  return {
    qrToken: cart.qrToken,
    items: cart.lines.map((l) => ({ productId: l.productId, quantity: l.quantity, optionIds: l.optionIds, ...(l.note ? { note: l.note } : {}) })),
    ...(note ? { customerNote: note } : {}),
    ...(expectedTotalMinor === undefined ? {} : { expectedTotalMinor }),
  };
}

/**
 * The idempotency key for submitting `body`. A retry of the same body (network error, double tap)
 * reuses the stored key so the server returns the first order; any other body gets a new key.
 */
export function submissionKey(cart: Cart, body: OrderBody, newKey: () => string): { cart: Cart; key: string } {
  const text = JSON.stringify(body);
  if (cart.pending?.body === text) return { cart, key: cart.pending.key };
  const key = newKey();
  return { cart: { ...cart, pending: { key, body: text } }, key };
}

/** Display-only estimate from the loaded menu; lines no longer on the menu count as zero. */
export function estimateMinor(cart: Cart, prices: PriceBook): number {
  let total = 0;
  for (const line of cart.lines) {
    const product = prices.get(line.productId);
    if (!product) continue;
    const extras = line.optionIds.reduce((sum, id) => sum + (product.options.get(id) ?? 0), 0);
    total += (product.priceMinor + extras) * line.quantity;
  }
  return total;
}

/** Accepts only a well-formed stored cart; anything else is treated as no cart. */
export function parseCart(text: string | null): Cart | null {
  if (!text) return null;
  try {
    const c = JSON.parse(text) as Cart;
    const ok =
      c?.v === 1 &&
      typeof c.qrToken === "string" &&
      (c.tableNumber === null || typeof c.tableNumber === "number") &&
      typeof c.customerNote === "string" &&
      Array.isArray(c.lines) &&
      c.lines.every(
        (l) =>
          typeof l.id === "string" &&
          typeof l.productId === "string" &&
          Array.isArray(l.optionIds) &&
          l.optionIds.every((o) => typeof o === "string") &&
          Number.isInteger(l.quantity) &&
          l.quantity > 0 &&
          typeof l.note === "string",
      );
    return ok ? { ...c, pending: c.pending ?? null } : null;
  } catch {
    return null;
  }
}

/** A random key for the Idempotency-Key header (ADR-012: 16–64 URL-safe characters). */
export function randomKey(bytes = 18): string {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  let binary = "";
  for (const b of data) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
