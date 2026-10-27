import { ZodError } from "zod";
import { MoneyError } from "@/server/money";
import { OrderError } from "./create";
import { PricingError } from "./pricing";

// JSON error responses for the public order endpoints (ADR-012).

export const jsonError = (status: number, code: string, message: string, extra: object = {}) =>
  Response.json({ code, message, ...extra }, { status, headers: { "Cache-Control": "no-store" } });

export function orderErrorResponse(e: unknown): Response {
  if (e instanceof OrderError) return jsonError(e.status, e.code, e.message, e.details);
  if (e instanceof ZodError) return jsonError(400, "INVALID_REQUEST", "The order request is not valid.", { issues: e.issues.map((i) => i.path.join(".")) });
  if (e instanceof PricingError || e instanceof MoneyError) return jsonError(400, "INVALID_REQUEST", e.message);
  throw e;
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ZodError([{ code: "custom", path: [], message: "Body must be JSON.", input: undefined }]);
  }
}

export const tokenOf = (body: unknown) =>
  typeof body === "object" && body !== null && typeof (body as { qrToken?: unknown }).qrToken === "string"
    ? (body as { qrToken: string }).qrToken.slice(0, 64)
    : "unknown";
