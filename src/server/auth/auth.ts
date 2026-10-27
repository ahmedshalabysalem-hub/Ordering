import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { eq, sql as dsql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { db } from "@/server/db/client";
import { authAccounts, authSessions, authVerifications, users } from "@/server/db/schema";
import { env } from "@/server/env";
import { afterFailedAttempt, isLocked } from "./lockout";

const SIGN_IN_PATH = "/sign-in/email";
export const LOCKED_MESSAGE = "Too many failed attempts. Try again later.";

const byEmail = (email: string) => dsql`lower(${users.email}) = lower(${email})`;

async function loadLockState(email: string) {
  const [row] = await db
    .select({ failedLoginCount: users.failedLoginCount, lockedUntil: users.lockedUntil })
    .from(users)
    .where(byEmail(email));
  return row;
}

export const auth = betterAuth({
  secret: env().BETTER_AUTH_SECRET,
  baseURL: env().BETTER_AUTH_URL,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user: users, session: authSessions, account: authAccounts, verification: authVerifications },
  }),
  advanced: {
    database: { generateId: () => uuidv7() },
  },
  emailAndPassword: {
    enabled: true,
    // Staff accounts are created by an admin or the bootstrap command, never by self sign-up.
    disableSignUp: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
  },
  // Only the endpoints the app uses are reachable over HTTP.
  disabledPaths: ["/sign-up/email", "/request-password-reset", "/reset-password", "/change-email", "/delete-user"],
  session: {
    expiresIn: 60 * 60 * 12, // one shift
    updateAge: 60 * 60,
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    customRules: { [SIGN_IN_PATH]: { window: 60, max: 10 } },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== SIGN_IN_PATH) return;
      const email = typeof ctx.body?.email === "string" ? ctx.body.email : "";
      const row = email ? await loadLockState(email) : undefined;
      if (row && isLocked(row, new Date())) {
        throw new APIError("TOO_MANY_REQUESTS", { message: LOCKED_MESSAGE });
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== SIGN_IN_PATH) return;
      const email = typeof ctx.body?.email === "string" ? ctx.body.email : "";
      if (!email) return;
      const failed = isAPIError(ctx.context.returned);
      if (!failed) {
        await db
          .update(users)
          .set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() })
          .where(byEmail(email));
        return;
      }
      // Count a failure under a row lock so parallel attempts cannot skip the lock.
      await db.transaction(async (tx) => {
        const [row] = await tx
          .select({ id: users.id, failedLoginCount: users.failedLoginCount, lockedUntil: users.lockedUntil })
          .from(users)
          .where(byEmail(email))
          .for("update");
        if (!row) return;
        await tx.update(users).set(afterFailedAttempt(row, new Date())).where(eq(users.id, row.id));
      });
    }),
  },
  databaseHooks: {
    session: {
      create: {
        // Deactivated or locked users never get a session, whatever path created it.
        before: async (session) => {
          const [row] = await db
            .select({ isActive: users.isActive, lockedUntil: users.lockedUntil })
            .from(users)
            .where(eq(users.id, session.userId));
          if (!row || !row.isActive) return false;
          if (row.lockedUntil && row.lockedUntil.getTime() > Date.now()) return false;
        },
      },
    },
  },
  plugins: [nextCookies()],
});
