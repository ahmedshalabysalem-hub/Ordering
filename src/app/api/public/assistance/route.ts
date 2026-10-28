import { ZodError } from "zod";
import { AssistanceError, requestAssistance } from "@/server/customer/assistance";
import { jsonError, readJson, tokenOf } from "@/server/orders/http";
import { allowRequest } from "@/server/rate-limit";

// Public: "Request Assistance" from a table QR code (UI-005, ADR-013).
export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    const token = tokenOf(body);
    if (!allowRequest(`assistance:${token}`, 5, 60_000)) {
      return jsonError(429, "RATE_LIMITED", "Too many requests from this table. Please wait a moment.", { retryAfterSeconds: 60 });
    }
    const result = await requestAssistance(token);
    return Response.json(result, { status: result.deduplicated ? 200 : 201, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof AssistanceError) return jsonError(e.status, e.code, e.message, { retryAfterSeconds: e.retryAfterSeconds });
    if (e instanceof ZodError) return jsonError(400, "INVALID_REQUEST", "The request is not valid.");
    throw e;
  }
}
