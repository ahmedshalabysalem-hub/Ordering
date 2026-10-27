import { afterAll, describe, expect, it } from "vitest";
import { sql } from "@/server/db/client";

describe("database connection", () => {
  afterAll(async () => {
    await sql.end();
  });

  it("runs a query against PostgreSQL 16+", async () => {
    const [row] = await sql<{ version: number }[]>`select current_setting('server_version_num')::int as version`;
    expect(row.version).toBeGreaterThanOrEqual(160000);
  });
});
