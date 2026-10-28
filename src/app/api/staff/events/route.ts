import { authErrorResponse, getCurrentStaff } from "@/server/auth/session";
import { AuthError, branchFor, can } from "@/server/auth/permissions";
import { eventStream } from "@/server/realtime/sse";

// Live updates for cashier, kitchen and captain screens (RT-001, ADR-014): every event of the staff
// member's branch. Streams end after 10 minutes so the browser reconnects and is authorized again.
export async function GET(req: Request) {
  try {
    const staff = await getCurrentStaff();
    if (!staff) throw new AuthError(401);
    const permission = can(staff, "orders.view_operational") ? "orders.view_operational" : "kitchen.view";
    const branchId = branchFor(staff, permission);
    return await eventStream({
      signal: req.signal,
      maxAgeMs: 10 * 60_000,
      select: (event) => (event.branchId === branchId ? event : null),
    });
  } catch (e) {
    return authErrorResponse(e);
  }
}
