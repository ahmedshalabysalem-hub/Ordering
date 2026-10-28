// What the customer sees of an order's state (UI-005). Pure, so the tracking page's client code can
// use it too.

type OrderState = { kitchenStatus: string; deliveryStatus: string; paymentStatus: string };

/** One status for the customer: cancelled, served, or the kitchen status. */
export function customerStatus(o: Pick<OrderState, "kitchenStatus" | "deliveryStatus">): string {
  if (o.kitchenStatus === "CANCELLED") return "CANCELLED";
  if (o.deliveryStatus === "DELIVERED") return "DELIVERED";
  return o.kitchenStatus;
}

/** True once nothing about the order will change for the customer, so the page stops refreshing. */
export const isFinal = (o: OrderState) =>
  o.kitchenStatus === "CANCELLED" || (o.deliveryStatus === "DELIVERED" && ["PAID", "REFUNDED", "PARTIALLY_REFUNDED"].includes(o.paymentStatus));
