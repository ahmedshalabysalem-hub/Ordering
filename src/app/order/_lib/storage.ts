import { type Cart, parseCart } from "./cart";

// Browser storage for the customer app (ADR-013). Every access is guarded: private mode or blocked
// storage simply means the cart does not survive a refresh.

const CART_KEY = "ordering.cart.v1";
const ORDERS_KEY = "ordering.orders.v1";

export type PlacedOrder = { qrToken: string; trackingToken: string; orderRef: string; placedAt: string };

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Storage unavailable: the cart lives in memory only.
  }
}

export const loadCart = (): Cart | null => parseCart(read(CART_KEY));
export const saveCart = (cart: Cart | null) => write(CART_KEY, cart && cart.lines.length + cart.customerNote.length > 0 ? JSON.stringify(cart) : null);

export function loadOrders(qrToken: string): PlacedOrder[] {
  try {
    const all = JSON.parse(read(ORDERS_KEY) ?? "[]") as PlacedOrder[];
    return Array.isArray(all) ? all.filter((o) => o?.qrToken === qrToken && typeof o.trackingToken === "string") : [];
  } catch {
    return [];
  }
}

export function rememberOrder(order: PlacedOrder) {
  let all: PlacedOrder[] = [];
  try {
    all = JSON.parse(read(ORDERS_KEY) ?? "[]") as PlacedOrder[];
    if (!Array.isArray(all)) all = [];
  } catch {
    all = [];
  }
  write(ORDERS_KEY, JSON.stringify([order, ...all.filter((o) => o.trackingToken !== order.trackingToken)].slice(0, 20)));
}

/** The order this browser placed with `trackingToken`, if any (for the "back to menu" link). */
export function loadOrdersByToken(trackingToken: string): PlacedOrder | null {
  try {
    const all = JSON.parse(read(ORDERS_KEY) ?? "[]") as PlacedOrder[];
    return (Array.isArray(all) && all.find((o) => o?.trackingToken === trackingToken)) || null;
  } catch {
    return null;
  }
}
