import { z } from "zod";
import { authErrorResponse, authorize } from "@/server/auth/session";
import { cancelClosing, closeSession, SessionError, startClosing } from "@/server/sessions/service";

// Table session moves (ORD-002, ADR-008 §4). Body: { "version": <number> } from the last read.
const actions = { "start-closing": startClosing, "cancel-closing": cancelClosing, close: closeSession } as const;
const body = z.object({ version: z.number().int().min(1) });

export async function POST(req: Request, ctx: RouteContext<"/api/staff/sessions/[id]/[action]">) {
  const { id, action } = await ctx.params;
  const move = actions[action as keyof typeof actions];
  if (!move || !z.uuid().safeParse(id).success) return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  try {
    const staff = await authorize("session.close");
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return Response.json({ code: "INVALID_REQUEST", message: "Send the session version." }, { status: 400 });
    const session = await move(staff, id, parsed.data.version);
    return Response.json({ id: session.id, status: session.status, version: session.version });
  } catch (e) {
    if (e instanceof SessionError) {
      const status = e.code === "NOT_FOUND" ? 404 : 409;
      return Response.json({ code: e.code, message: e.message, blockingOrders: e.blockingOrders }, { status });
    }
    return authErrorResponse(e);
  }
}
