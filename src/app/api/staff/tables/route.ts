import { authErrorResponse, authorize } from "@/server/auth/session";
import { getTablesOverview } from "@/server/sessions/service";

// Cashier grid data: every table with its open session and derived status (ADR-008 §6).
export async function GET() {
  try {
    const staff = await authorize("orders.view_operational");
    return Response.json(await getTablesOverview(staff), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return authErrorResponse(e);
  }
}
