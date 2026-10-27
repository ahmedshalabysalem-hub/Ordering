import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, LOCKED_MESSAGE } from "@/server/auth/auth";
import { AdminAlreadyExistsError, bootstrapAdmin } from "@/server/auth/bootstrap";
import { MAX_FAILED_ATTEMPTS } from "@/server/auth/lockout";
import { resetTestDatabase } from "../helpers/test-db";
import { sql } from "./helpers/db";

const PASSWORD = "correct-horse-battery";

// The bootstrap refuses once any admin exists, and other suites create admins, so start from an empty
// database whatever order the files run in.
beforeAll(async () => {
  await resetTestDatabase();
});

afterAll(async () => {
  await sql.end();
});

const signIn = (email: string, password: string) =>
  auth.api.signInEmail({ body: { email, password }, headers: new Headers() });

async function signInError(email: string, password: string) {
  try {
    await signIn(email, password);
  } catch (e) {
    return e as Error;
  }
  throw new Error("expected sign-in to fail");
}

describe("first administrator bootstrap", () => {
  it("creates the admin, the default branch and settings, and refuses a second run", async () => {
    const result = await bootstrapAdmin({ email: "Owner@Example.com", name: "Owner", password: PASSWORD });

    const [user] = await sql`select email, is_active from users where id = ${result.userId}`;
    expect(user).toEqual({ email: "owner@example.com", is_active: true });
    const roles = await sql`select role from user_roles where user_id = ${result.userId}`;
    expect(roles.map((r) => r.role)).toEqual(["ADMIN"]);
    const [branch] = await sql`select currency, timezone from branches where id = ${result.branchId}`;
    expect(branch).toEqual({ currency: "EGP", timezone: "Africa/Cairo" });
    const methods = await sql`select code from payment_methods where branch_id = ${result.branchId} order by code`;
    expect(methods.map((m) => m.code)).toEqual(["CARD", "CASH"]);
    const [account] = await sql`select password from auth_accounts where user_id = ${result.userId}`;
    expect(account.password).toBeTruthy();
    expect(account.password).not.toContain(PASSWORD);
    const [audit] = await sql`select action from audit_logs where entity_id = ${result.userId}`;
    expect(audit.action).toBe("ADMIN_BOOTSTRAPPED");

    await expect(bootstrapAdmin({ email: "second@example.com", name: "Second", password: PASSWORD })).rejects.toThrow(
      AdminAlreadyExistsError,
    );
    const [{ count }] = await sql`select count(*)::int as count from users where email = 'second@example.com'`;
    expect(count).toBe(0);
  });

  it("rejects a short password", async () => {
    await expect(bootstrapAdmin({ email: "x@example.com", name: "X", password: "short" })).rejects.toThrow();
  });
});

describe("staff sign-in", () => {
  it("signs in with the right password and records the login", async () => {
    const result = await signIn("owner@example.com", PASSWORD);
    expect(result.user.email).toBe("owner@example.com");
    const [row] = await sql`select failed_login_count, last_login_at from users where email = 'owner@example.com'`;
    expect(row.failed_login_count).toBe(0);
    expect(Date.now() - new Date(row.last_login_at).getTime()).toBeLessThan(60_000);
  });

  it("rejects a wrong password without saying whether the account exists", async () => {
    const wrong = await signInError("owner@example.com", "wrong-password-1");
    const unknown = await signInError("nobody@example.com", "wrong-password-1");
    expect(wrong.message).toBe(unknown.message);
    await sql`update users set failed_login_count = 0 where email = 'owner@example.com'`;
  });

  it(`locks the account after ${MAX_FAILED_ATTEMPTS} failures, even for the right password`, async () => {
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) await signInError("owner@example.com", "wrong-password-1");
    const [row] = await sql`select failed_login_count, locked_until from users where email = 'owner@example.com'`;
    expect(row.failed_login_count).toBe(MAX_FAILED_ATTEMPTS);
    expect(new Date(row.locked_until).getTime()).toBeGreaterThan(Date.now());

    const locked = await signInError("owner@example.com", PASSWORD);
    expect(locked.message).toBe(LOCKED_MESSAGE);

    // Once the lock expires, the right password works and resets the counter.
    await sql`update users set locked_until = now() - interval '1 second' where email = 'owner@example.com'`;
    await signIn("owner@example.com", PASSWORD);
    const [after] = await sql`select failed_login_count, locked_until from users where email = 'owner@example.com'`;
    expect(after).toEqual({ failed_login_count: 0, locked_until: null });
  });

  it("refuses deactivated users", async () => {
    await sql`update users set is_active = false where email = 'owner@example.com'`;
    try {
      await signInError("owner@example.com", PASSWORD);
    } finally {
      await sql`update users set is_active = true where email = 'owner@example.com'`;
    }
  });

  it("does not allow self sign-up", async () => {
    const res = await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({ email: "intruder@example.com", password: PASSWORD, name: "Intruder" }),
      }),
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
    const [{ count }] = await sql`select count(*)::int as count from users where email = 'intruder@example.com'`;
    expect(count).toBe(0);
  });
});
