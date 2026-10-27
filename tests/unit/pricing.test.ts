import { describe, expect, it } from "vitest";
import { divideHalfUp, lineTotalMinor, PricingError, priceOrder } from "@/server/orders/pricing";

const exclusive14 = { taxBps: 1400, pricesIncludeTax: false, serviceChargeBps: 0 };

describe("order pricing (ADR-012)", () => {
  it("rounds half up on integers", () => {
    expect(divideHalfUp(5n, 10n)).toBe(1n);
    expect(divideHalfUp(4n, 10n)).toBe(0n);
    expect(divideHalfUp(15n, 10n)).toBe(2n);
    expect(divideHalfUp(14n, 10n)).toBe(1n);
    expect(() => divideHalfUp(-1n, 10n)).toThrow(PricingError);
  });

  it("totals lines with options and quantities", () => {
    expect(lineTotalMinor({ unitPriceMinor: 4550, modifiersTotalMinor: 1050, quantity: 3 })).toBe(16800);
  });

  it("adds exclusive tax once per order, rounded half up", () => {
    // 2 × 45.50 + 19.99 = 110.99; 14% = 15.5386 → 15.54
    const totals = priceOrder(
      [
        { unitPriceMinor: 4550, modifiersTotalMinor: 0, quantity: 2 },
        { unitPriceMinor: 1999, modifiersTotalMinor: 0, quantity: 1 },
      ],
      exclusive14,
    );
    expect(totals).toEqual({ subtotalMinor: 11099, discountMinor: 0, taxMinor: 1554, serviceMinor: 0, totalMinor: 12653 });
  });

  it("splits tax out of tax-inclusive prices so the customer pays the menu price", () => {
    // 114.00 gross at 14% inclusive = 100.00 net + 14.00 tax
    expect(priceOrder([{ unitPriceMinor: 11400, modifiersTotalMinor: 0, quantity: 1 }], { ...exclusive14, pricesIncludeTax: true })).toEqual({
      subtotalMinor: 10000,
      discountMinor: 0,
      taxMinor: 1400,
      serviceMinor: 0,
      totalMinor: 11400,
    });
    // Saudi VAT 15% inclusive on 10.00: net = 8.6956… → 8.70, tax 1.30
    const sar = priceOrder([{ unitPriceMinor: 1000, modifiersTotalMinor: 0, quantity: 1 }], { taxBps: 1500, pricesIncludeTax: true, serviceChargeBps: 0 });
    expect(sar).toMatchObject({ subtotalMinor: 870, taxMinor: 130, totalMinor: 1000 });
  });

  it("adds an untaxed service charge on the net subtotal", () => {
    // 100.00 + 14% tax + 12% service
    expect(priceOrder([{ unitPriceMinor: 10000, modifiersTotalMinor: 0, quantity: 1 }], { ...exclusive14, serviceChargeBps: 1200 })).toEqual({
      subtotalMinor: 10000,
      discountMinor: 0,
      taxMinor: 1400,
      serviceMinor: 1200,
      totalMinor: 12600,
    });
  });

  it("keeps total = subtotal - discount + tax + service for many random carts", () => {
    let seed = 42;
    const rand = (max: number) => (seed = (seed * 1103515245 + 12345) % 2 ** 31) % max;
    for (let i = 0; i < 500; i++) {
      const lines = Array.from({ length: 1 + rand(5) }, () => ({
        unitPriceMinor: rand(100000),
        modifiersTotalMinor: rand(3000),
        quantity: 1 + rand(9),
      }));
      const t = priceOrder(lines, { taxBps: rand(3000), pricesIncludeTax: rand(2) === 1, serviceChargeBps: rand(2000) });
      expect(t.totalMinor).toBe(t.subtotalMinor - t.discountMinor + t.taxMinor + t.serviceMinor);
      for (const v of Object.values(t)) expect(Number.isSafeInteger(v) && v >= 0).toBe(true);
    }
  });

  it("refuses amounts beyond the safe integer range", () => {
    expect(() => priceOrder([{ unitPriceMinor: Number.MAX_SAFE_INTEGER, modifiersTotalMinor: 0, quantity: 2 }], exclusive14)).toThrow(PricingError);
  });
});
