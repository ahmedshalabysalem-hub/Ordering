import { connection } from "next/server";
import { sql } from "@/server/db/client";

export async function GET() {
  await connection();
  try {
    await sql`select 1`;
    return Response.json({ status: "ok", db: "ok" });
  } catch {
    return Response.json({ status: "error", db: "unreachable" }, { status: 503 });
  }
}
