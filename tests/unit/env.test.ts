import { describe, expect, it } from "vitest";
import { parseEnv } from "@/server/env";

const SECRET = "x".repeat(32);

describe("parseEnv", () => {
  it("accepts a postgres URL and an auth secret", () => {
    const env = parseEnv({ DATABASE_URL: "postgres://u:p@localhost:5432/db", BETTER_AUTH_SECRET: SECRET, NODE_ENV: "test" });
    expect(env.DATABASE_URL).toBe("postgres://u:p@localhost:5432/db");
    expect(env.NODE_ENV).toBe("test");
  });

  it("defaults NODE_ENV and BETTER_AUTH_URL", () => {
    const env = parseEnv({ DATABASE_URL: "postgresql://localhost/db", BETTER_AUTH_SECRET: SECRET });
    expect(env.NODE_ENV).toBe("development");
    expect(env.BETTER_AUTH_URL).toBe("http://localhost:3000");
  });

  it("rejects a missing DATABASE_URL", () => {
    expect(() => parseEnv({ BETTER_AUTH_SECRET: SECRET })).toThrow(/DATABASE_URL/);
  });

  it("rejects a non-postgres URL", () => {
    expect(() => parseEnv({ DATABASE_URL: "mysql://localhost/db", BETTER_AUTH_SECRET: SECRET })).toThrow(/postgres/);
  });

  it("rejects a short auth secret", () => {
    expect(() => parseEnv({ DATABASE_URL: "postgres://localhost/db", BETTER_AUTH_SECRET: "short" })).toThrow(
      /BETTER_AUTH_SECRET/,
    );
  });
});
