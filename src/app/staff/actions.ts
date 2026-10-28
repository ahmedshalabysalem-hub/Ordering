"use server";

import { ZodError } from "zod";
import { AuthError, getCurrentStaff } from "@/server/auth/session";
import { setProductAvailability, MenuError } from "@/server/menu/service";
import { handleAssistance } from "@/server/operations/assistance";
import { assignCaptain, cancelOrder, type KitchenStatus, markDelivered, moveKitchenStatus, OperationError } from "@/server/operations/orders";
import { MoneyError, parseMoney } from "@/server/money";
import { recordPayment, recordRefund, recordSessionPayment } from "@/server/payments/service";
import { cancelClosing, closeSession, SessionError, startClosing } from "@/server/sessions/service";

// Server actions behind the cashier and kitchen screens (OPS-001..004). Every check happens in the
// services; these only turn failures into a message. Screens refresh through the live stream.

export type ActionResult = { ok?: string; error?: string };

async function run(fn: (staff: NonNullable<Awaited<ReturnType<typeof getCurrentStaff>>>) => Promise<unknown>, ok: string): Promise<ActionResult> {
  try {
    const staff = await getCurrentStaff();
    if (!staff) throw new AuthError(401);
    await fn(staff);
    return { ok };
  } catch (e) {
    if (e instanceof SessionError && e.code === "UNSETTLED_ORDERS") {
      const list = e.blockingOrders.map((o) => `${o.orderRef} (${o.reasons.join(", ").replace("_", " ")})`).join("; ");
      return { error: `Not settled yet: ${list}.` };
    }
    if (e instanceof OperationError || e instanceof SessionError || e instanceof AuthError || e instanceof MenuError || e instanceof MoneyError) return { error: e.message };
    if (e instanceof ZodError) return { error: "Check the form." };
    throw e;
  }
}

export const kitchenMove = async (orderId: string, version: number, to: KitchenStatus) =>
  run((s) => moveKitchenStatus(s, orderId, version, to), "Updated.");

export const cancelOrderAction = async (orderId: string, version: number, reason: string) =>
  run((s) => cancelOrder(s, orderId, version, reason), "Order cancelled.");

export const assignCaptainAction = async (orderId: string, version: number, captainId: string | null) =>
  run((s) => assignCaptain(s, orderId, version, captainId), captainId ? "Captain assigned." : "Captain removed.");

export const markDeliveredAction = async (orderId: string, version: number) => run((s) => markDelivered(s, orderId, version), "Marked as served.");

export const sessionAction = async (sessionId: string, version: number, action: "start-closing" | "cancel-closing" | "close") =>
  run(
    (s) => (action === "close" ? closeSession(s, sessionId, version) : action === "start-closing" ? startClosing(s, sessionId, version) : cancelClosing(s, sessionId, version)),
    action === "close" ? "Table closed." : action === "start-closing" ? "Closing started: new orders are blocked." : "Table reopened for orders.",
  );

export const assistanceAction = async (requestId: string, move: "acknowledge" | "resolve" | "cancel") =>
  run((s) => handleAssistance(s, requestId, move), "Done.");

export const productAvailabilityAction = async (productId: string, isAvailable: boolean) =>
  run((s) => setProductAvailability(s, productId, isAvailable), isAvailable ? "Available again." : "Marked sold out.");

export const recordPaymentAction = async (orderId: string, version: number, methodId: string, amountMinor: number, reference: string) =>
  run((s) => recordPayment(s, orderId, version, methodId, amountMinor, reference), "Payment recorded.");

export const recordSessionPaymentAction = async (sessionId: string, methodId: string, totalMinor: number, reference: string) =>
  run((s) => recordSessionPayment(s, sessionId, methodId, totalMinor, reference), "Payment recorded for the whole table.");

/** The refund amount comes as decimal text and is parsed to minor units without floats (ADR-011). */
export const recordRefundAction = async (orderId: string, version: number, amountText: string, currency: string, reason: string) =>
  run((s) => recordRefund(s, orderId, version, null, parseMoney(amountText, currency), reason), "Refund recorded.");
