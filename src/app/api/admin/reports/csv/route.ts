import { getReport, REPORT_SECTIONS, reportCsv, type ReportSection } from "@/server/admin/reports";
import { AuthError } from "@/server/auth/permissions";
import { authErrorResponse, getCurrentStaff } from "@/server/auth/session";
import { minorToDecimal } from "@/server/money";

// CSV export of one report section (ADM-005). Same access and date rules as the reports page.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const section = url.searchParams.get("section") as ReportSection;
  if (!REPORT_SECTIONS.includes(section)) return Response.json({ error: "Unknown report section." }, { status: 400 });
  try {
    const staff = await getCurrentStaff();
    if (!staff) throw new AuthError(401);
    const report = await getReport(staff, { from: url.searchParams.get("from") ?? undefined, to: url.searchParams.get("to") ?? undefined });
    const csv = reportCsv(report, section, (m) => minorToDecimal(m, report.currency));
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${section}_${report.range.from}_${report.range.to}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return authErrorResponse(e);
  }
}
