import { describe, expect, it } from "vitest";
import {
  addLine,
  emptyCart,
  estimateMinor,
  itemCount,
  MAX_QUANTITY,
  moveToTable,
  parseCart,
  randomKey,
  setCustomerNote,
  setQuantity,
  submissionKey,
  toOrderBody,
} from "@/app/order/_lib/cart";

let n = 0;
const id = () => `line-${++n}`;
const base = () => emptyCart("qr-token-aaaaaaaaaaaa", 7);

describe("cart (UI-003)", () => {
  it("merges identical choices and keeps different options or notes apart", () => {
    let cart = addLine(base(), { productId: "latte", optionIds: ["large", "oat"], quantity: 1, note: "" }, id);
    cart = addLine(cart, { productId: "latte", optionIds: ["oat", "large"], quantity: 2, note: " " }, id);
    cart = addLine(cart, { productId: "latte", optionIds: ["small"], quantity: 1, note: "" }, id);
    cart = addLine(cart, { productId: "latte", optionIds: ["small"], quantity: 1, note: "no sugar" }, id);
    expect(cart.lines.map((l) => [l.optionIds.join("+"), l.quantity, l.note])).toEqual([
      ["large+oat", 3, ""],
      ["small", 1, ""],
      ["small", 1, "no sugar"],
    ]);
    expect(itemCount(cart)).toBe(5);
  });

  it("caps quantities and removes a line at zero", () => {
    let cart = addLine(base(), { productId: "water", optionIds: [], quantity: 1, note: "" }, id);
    const lineId = cart.lines[0].id;
    cart = setQuantity(cart, lineId, 999);
    expect(cart.lines[0].quantity).toBe(MAX_QUANTITY);
    cart = setQuantity(cart, lineId, 0);
    expect(cart.lines).toEqual([]);
  });

  it("builds a request body without any price", () => {
    let cart = addLine(base(), { productId: "latte", optionIds: ["large"], quantity: 2, note: "hot" }, id);
    cart = addLine(cart, { productId: "water", optionIds: [], quantity: 1, note: "" }, id);
    cart = setCustomerNote(cart, "  window seat ");
    expect(toOrderBody(cart, 1234)).toEqual({
      qrToken: "qr-token-aaaaaaaaaaaa",
      items: [
        { productId: "latte", quantity: 2, optionIds: ["large"], note: "hot" },
        { productId: "water", quantity: 1, optionIds: [] },
      ],
      customerNote: "window seat",
      expectedTotalMinor: 1234,
    });
    expect(JSON.stringify(toOrderBody(cart))).not.toMatch(/price/i);
  });

  it("reuses the idempotency key only for the exact same submission", () => {
    let keys = 0;
    const newKey = () => `key-${++keys}`;
    let cart = addLine(base(), { productId: "water", optionIds: [], quantity: 1, note: "" }, id);
    const first = submissionKey(cart, toOrderBody(cart, 1000), newKey);
    const retry = submissionKey(first.cart, toOrderBody(first.cart, 1000), newKey);
    expect(retry.key).toBe(first.key);
    // A new total after a price change, or any cart edit, is a different order request.
    expect(submissionKey(retry.cart, toOrderBody(retry.cart, 1100), newKey).key).not.toBe(first.key);
    cart = setQuantity(first.cart, first.cart.lines[0].id, 2);
    expect(cart.pending).toBeNull();
  });

  it("estimates from menu prices with integer math", () => {
    let cart = addLine(base(), { productId: "latte", optionIds: ["large"], quantity: 3, note: "" }, id);
    cart = addLine(cart, { productId: "gone", optionIds: [], quantity: 1, note: "" }, id);
    const prices = new Map([["latte", { priceMinor: 4550, options: new Map([["large", 1050]]) }]]);
    expect(estimateMinor(cart, prices)).toBe(16800);
  });

  it("moves a cart to another table only when asked, and parses stored carts defensively", () => {
    const cart = addLine(base(), { productId: "water", optionIds: [], quantity: 1, note: "" }, id);
    const moved = moveToTable(cart, "other-token-bbbbbbbbbb", 9);
    expect([moved.qrToken, moved.tableNumber, moved.lines.length]).toEqual(["other-token-bbbbbbbbbb", 9, 1]);
    expect(parseCart(JSON.stringify(cart))).toEqual(cart);
    expect(parseCart("not json")).toBeNull();
    expect(parseCart(JSON.stringify({ ...cart, lines: [{ ...cart.lines[0], quantity: -1 }] }))).toBeNull();
    expect(parseCart(JSON.stringify({ ...cart, v: 2 }))).toBeNull();
  });

  it("makes URL-safe idempotency keys the API accepts", () => {
    const key = randomKey();
    expect(key).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
    expect(randomKey()).not.toBe(key);
  });
});
