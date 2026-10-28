import { findTrackedOrderId } from "@/server/customer/tracking";
import { jsonError } from "@/server/orders/http";
import { eventStream } from "@/server/realtime/sse";

// Live updates for one customer's order page (RT-001, ADR-014). Only the tracking token opens it, and
// it only ever says "your order changed": the page then re-reads the order.

const MAX_PER_ORDER = 20;
const MAX_TOTAL = 2000;
const open = new Map<string, number>();
let total = 0;

export async function GET(req: Request, { params }: RouteContext<"/api/public/orders/[trackingToken]/events">) {
  const { trackingToken } = await params;
  const orderId = await findTrackedOrderId(trackingToken);
  if (!orderId) return jsonError(404, "ORDER_NOT_FOUND", "This order link is not valid.");
  if ((open.get(orderId) ?? 0) >= MAX_PER_ORDER || total >= MAX_TOTAL) {
    return jsonError(429, "TOO_MANY_STREAMS", "Too many live connections. The page will refresh by itself.");
  }
  open.set(orderId, (open.get(orderId) ?? 0) + 1);
  total += 1;
  return eventStream({
    signal: req.signal,
    maxAgeMs: 30 * 60_000,
    select: (event) => (event.orderId === orderId && (event.type === "order.updated" || event.type === "order.created") ? { type: "order.updated" } : null),
    onClose: () => {
      total -= 1;
      const left = (open.get(orderId) ?? 1) - 1;
      if (left > 0) open.set(orderId, left);
      else open.delete(orderId);
    },
  });
}
