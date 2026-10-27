import { createOrder } from "@/server/orders/create";
import { jsonError, orderErrorResponse, readJson, tokenOf } from "@/server/orders/http";
import { allowRequest } from "@/server/rate-limit";

// Public: a customer submits an order from a table QR code (ADR-012). No account, no prices accepted.
export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    if (!allowRequest(`order:${tokenOf(body)}`, 10, 60_000)) {
      return jsonError(429, "RATE_LIMITED", "Too many orders from this table. Please wait a moment.");
    }
    const key = req.headers.get("idempotency-key");
    if (!key) return jsonError(400, "IDEMPOTENCY_KEY_REQUIRED", "Send an Idempotency-Key header with each order.");
    const order = await createOrder(body as Parameters<typeof createOrder>[0], key);
    return Response.json(order, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return orderErrorResponse(e);
  }
}
