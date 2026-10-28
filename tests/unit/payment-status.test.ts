import { describe, expect, it } from "vitest";
import { derivePaymentStatus } from "@/server/payments/status";

describe("derived payment status (ADR-008 §3)", () => {
  it.each([
    [1000, 0, 0, "UNPAID", 0],
    [1000, 400, 0, "PARTIALLY_PAID", 400],
    [1000, 1000, 0, "PAID", 1000],
    [1000, 1000, 1000, "REFUNDED", 0],
    [1000, 1000, 300, "PARTIALLY_REFUNDED", 700],
  ])("total %i, paid %i, refunded %i → %s", (total, paid, refunded, status, net) => {
    expect(derivePaymentStatus(total, paid, refunded)).toEqual({ status, netMinor: net });
  });
});
