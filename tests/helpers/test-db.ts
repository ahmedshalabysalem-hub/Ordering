import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/**
 * Drops and recreates the public schema, then applies all migrations.
 * Refuses to touch a database whose name does not end in `_test`.
 */
export async function resetTestDatabase(url = process.env.DATABASE_URL) {
  if (!url) throw new Error("DATABASE_URL is required for tests");
  const dbName = new URL(url).pathname.replace(/^\//, "");
  if (!dbName.endsWith("_test")) {
    throw new Error(`Refusing to reset "${dbName}": test databases must end in _test`);
  }
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await sql`drop schema if exists drizzle cascade`;
    await sql`drop schema public cascade`;
    await sql`create schema public`;
    await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
  } finally {
    await sql.end();
  }
}
