import { authErrorResponse, AuthError, getCurrentStaff } from "@/server/auth/session";
import { permissionsFor } from "@/server/auth/permissions";

// The signed-in staff member, their roles and effective permissions (for staff UIs).
export async function GET() {
  try {
    const staff = await getCurrentStaff();
    if (!staff) throw new AuthError(401);
    return Response.json({
      id: staff.id,
      name: staff.name,
      email: staff.email,
      roles: staff.roles,
      permissions: [...permissionsFor(staff.roles.map((r) => r.role))].sort(),
    });
  } catch (e) {
    return authErrorResponse(e);
  }
}
