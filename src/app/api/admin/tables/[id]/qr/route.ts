import { authErrorResponse, authorize } from "@/server/auth/session";
import { qrPng, qrSvg } from "@/server/tables/qr";
import { getTable } from "@/server/tables/service";

// GET ?format=png|svg&download=1 — the table's permanent QR code (admins only).
export async function GET(request: Request, ctx: RouteContext<"/api/admin/tables/[id]/qr">) {
  try {
    const staff = await authorize("tables.manage");
    const { id } = await ctx.params;
    const table = await getTable(staff, id);
    if (!table) return Response.json({ error: "Table not found." }, { status: 404 });

    const url = new URL(request.url);
    const download = url.searchParams.get("download") === "1";
    const filename = `table-${table.number}-qr`;
    const headers: Record<string, string> = { "cache-control": "private, no-store" };

    if (url.searchParams.get("format") === "svg") {
      headers["content-type"] = "image/svg+xml";
      if (download) headers["content-disposition"] = `attachment; filename="${filename}.svg"`;
      return new Response(await qrSvg(table.qrToken), { headers });
    }
    headers["content-type"] = "image/png";
    if (download) headers["content-disposition"] = `attachment; filename="${filename}.png"`;
    return new Response(new Uint8Array(await qrPng(table.qrToken)), { headers });
  } catch (e) {
    return authErrorResponse(e);
  }
}
