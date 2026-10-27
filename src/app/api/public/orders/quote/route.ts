import { quoteOrder } from "@/server/orders/create";
import { jsonError, orderErrorResponse, readJson, tokenOf } from "@/server/orders/http";
import { allowRequest } from "@/server/rate-limit";

// Public: prices a cart from the current menu without placing an order (ADR-012).
export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    if (!allowRequest(`quote:${tokenOf(body)}`, 60, 60_000)) {
      return jsonError(429, "RATE_LIMITED", "Too many requests. Please wait a moment.");
    }
    const quote = await quoteOrder(body as Parameters<typeof quoteOrder>[0]);
    return Response.json(quote, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return orderErrorResponse(e);
  }
}
