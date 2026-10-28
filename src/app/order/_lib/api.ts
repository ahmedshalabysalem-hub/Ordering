import type { ItemProblem, Quote } from "@/server/orders/create";
import type { OrderBody } from "./cart";

// Calls to the public customer APIs (ADR-012, ADR-013). Errors come back as data, never thrown,
// except a network failure, which the caller shows as "try again".

export type ApiError = { code: string; message: string; problems?: ItemProblem[]; quote?: Quote; retryAfterSeconds?: number };
export type ApiResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; error: ApiError };

export class NetworkError extends Error {}

async function post<T>(url: string, body: unknown, headers: Record<string, string> = {}): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
  } catch {
    throw new NetworkError();
  }
  const json = await res.json().catch(() => null);
  if (res.ok) return { ok: true, status: res.status, data: json as T };
  if (res.status >= 500 || !json) throw new NetworkError();
  return { ok: false, status: res.status, error: json as ApiError };
}

export type PlacedOrderResponse = { orderId: string; orderRef: string; trackingToken: string; currency: string; totals: Quote["totals"] };
export type AssistanceResponse = { status: "PENDING"; createdAt: string; deduplicated: boolean };

export const fetchQuote = (body: OrderBody) => post<Quote>("/api/public/orders/quote", body);
export const placeOrder = (body: OrderBody, key: string) => post<PlacedOrderResponse>("/api/public/orders", body, { "Idempotency-Key": key });
export const callAssistance = (qrToken: string) => post<AssistanceResponse>("/api/public/assistance", { qrToken });
