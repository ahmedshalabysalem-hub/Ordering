import { describe, expect, it } from "vitest";
import { dirOf, money, pick, translator } from "@/i18n";
import { ar } from "@/i18n/ar";
import { en } from "@/i18n/en";
import { customerStatus, isFinal } from "@/server/customer/status";

describe("customer translations (UI-002)", () => {
  it("has every English key in Arabic, with the same placeholders", () => {
    expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort());
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(vars(ar[key]), key).toEqual(vars(en[key]));
      expect(ar[key].trim(), key).not.toBe("");
    }
  });

  it("fills placeholders and sets the direction", () => {
    expect(translator("ar")("table.label", { number: 12 })).toBe("ترابيزة 12");
    expect(translator("en")("table.label", { number: 12 })).toBe("Table 12");
    expect(dirOf("ar")).toBe("rtl");
    expect(dirOf("en")).toBe("ltr");
  });

  it("falls back to the other language when a field is empty", () => {
    expect(pick("en", "وصف", null)).toBe("وصف");
    expect(pick("ar", "  ", "Description")).toBe("Description");
    expect(pick("ar", "اسم", "Name")).toBe("اسم");
    expect(pick("en", null, null)).toBe("");
  });

  it("keeps the currency and Western digits whatever the language", () => {
    expect(money("en", 4550, "EGP").replace(/\s/g, " ")).toBe("EGP 45.50");
    const arabic = money("ar", 4550, "EGP");
    expect(arabic).toContain("45.50");
    expect(arabic).not.toMatch(/[٠-٩]/);
  });
});

describe("customer order status (UI-005)", () => {
  it("shows cancelled, served or the kitchen status, and stops refreshing when settled", () => {
    expect(customerStatus({ kitchenStatus: "CANCELLED", deliveryStatus: "DELIVERED" })).toBe("CANCELLED");
    expect(customerStatus({ kitchenStatus: "READY", deliveryStatus: "DELIVERED" })).toBe("DELIVERED");
    expect(customerStatus({ kitchenStatus: "IN_PREPARATION", deliveryStatus: "NOT_ASSIGNED" })).toBe("IN_PREPARATION");
    expect(isFinal({ kitchenStatus: "READY", deliveryStatus: "DELIVERED", paymentStatus: "UNPAID" })).toBe(false);
    expect(isFinal({ kitchenStatus: "READY", deliveryStatus: "DELIVERED", paymentStatus: "PAID" })).toBe(true);
    expect(isFinal({ kitchenStatus: "CANCELLED", deliveryStatus: "NOT_ASSIGNED", paymentStatus: "UNPAID" })).toBe(true);
  });
});
