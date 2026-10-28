// Payment status is derived, never set by hand (ADR-008 §3). Pure integer math on minor units.

export type PaymentStatus = "UNPAID" | "PARTIALLY_PAID" | "PAID" | "REFUNDED" | "PARTIALLY_REFUNDED";

export function derivePaymentStatus(totalMinor: number, paidMinor: number, refundedMinor: number): { status: PaymentStatus; netMinor: number } {
  const netMinor = paidMinor - refundedMinor;
  if (refundedMinor > 0) {
    if (netMinor <= 0) return { status: "REFUNDED", netMinor };
    return { status: netMinor >= totalMinor ? "PAID" : "PARTIALLY_REFUNDED", netMinor };
  }
  if (netMinor <= 0) return { status: "UNPAID", netMinor };
  return { status: netMinor >= totalMinor ? "PAID" : "PARTIALLY_PAID", netMinor };
}
