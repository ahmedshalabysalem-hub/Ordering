import { describe, expect, it } from "vitest";
import { parseEnv } from "@/server/env";

describe("parseEnv", () => {
  it("accepts a postgres URL", () => {
    const env = parseEnv({ DATABASE_URL: "postgres://u:p@localhost:5432/db", NODE_ENV: "test" });
    expect(env.DATABASE_URL).toBe("postgres://u:p@localhost:5432/db");
    expect(env.NODE_ENV).toBe("test");
  });

  it("defaults NODE_ENV to development", () => {
    expect(parseEnv({ DATABASE_URL: "postgresql://localhost/db" }).NODE_ENV).toBe("development");
  });

  it("rejects a missing DATABASE_URL", () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
  });

  it("rejects a non-postgres URL", () => {
    expect(() => parseEnv({ DATABASE_URL: "mysql://localhost/db" })).toThrow(/postgres/);
  });
});
