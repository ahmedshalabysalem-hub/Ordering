import { authErrorResponse, authorize } from "@/server/auth/session";
import { branchFor } from "@/server/auth/permissions";
import { eventStream } from "@/server/realtime/sse";

// Live updates for cashier, kitchen and captain screens (RT-001, ADR-014): every event of the staff
// member's branch. Streams end after 10 minutes so the browser reconnects and is authorized again.
export async function GET(req: Request) {
  try {
    const staff = await authorize("orders.view_operational");
    const branchId = branchFor(staff, "orders.view_operational");
    return await eventStream({
      signal: req.signal,
      maxAgeMs: 10 * 60_000,
      select: (event) => (event.branchId === branchId ? event : null),
    });
  } catch (e) {
    return authErrorResponse(e);
  }
}
