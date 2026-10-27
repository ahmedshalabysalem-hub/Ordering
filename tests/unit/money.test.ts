import { describe, expect, it } from "vitest";
import { currencyDigits, formatMoney, MoneyError, minorToDecimal, parseMoney } from "@/server/money";

describe("money helpers (ADR-011)", () => {
  it("knows each currency's minor unit", () => {
    expect(currencyDigits("EGP")).toBe(2);
    expect(currencyDigits("JPY")).toBe(0);
    expect(currencyDigits("KWD")).toBe(3);
  });

  it("parses decimal text into minor units without floats", () => {
    expect(parseMoney("45.50", "EGP")).toBe(4550);
    expect(parseMoney("45.5", "EGP")).toBe(4550);
    expect(parseMoney(" 1,250 ", "EGP")).toBe(125000);
    expect(parseMoney("0.07", "EGP")).toBe(7);
    // 0.1 + 0.2 style float errors cannot happen: 19.99 is exactly 1999.
    expect(parseMoney("19.99", "EGP")).toBe(1999);
    expect(parseMoney("1.234", "KWD")).toBe(1234);
    expect(parseMoney("500", "JPY")).toBe(500);
  });

  it("rejects negatives, junk and extra decimal places instead of rounding", () => {
    for (const bad of ["", "-5", "abc", "1e3", "12.", ".5", "45.555"]) {
      expect(() => parseMoney(bad, "EGP"), bad).toThrow(MoneyError);
    }
    expect(() => parseMoney("5.5", "JPY")).toThrow(MoneyError);
  });

  it("formats minor units back to text", () => {
    expect(minorToDecimal(4550, "EGP")).toBe("45.50");
    expect(minorToDecimal(7, "EGP")).toBe("0.07");
    expect(minorToDecimal(-250, "EGP")).toBe("-2.50");
    expect(minorToDecimal(500, "JPY")).toBe("500");
    // Intl puts a no-break space between the code and the amount.
    const plain = (s: string) => s.replace(/\u00a0/g, " ");
    expect(plain(formatMoney(4550, "EGP"))).toBe("EGP 45.50");
    expect(plain(formatMoney(123456789, "EGP"))).toBe("EGP 1,234,567.89");
    expect(() => minorToDecimal(1.5, "EGP")).toThrow(MoneyError);
  });
});
