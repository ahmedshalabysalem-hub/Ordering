# ADR-009 — Staff authentication, lockout and admin bootstrap (AUTH-001)

**Status:** APPROVED 2026-10-27 by the Project Director under the user's delegation of technical decisions.

## Decision
- **Library:** Better Auth (ADR-005) with the Drizzle adapter. Its tables are `auth_sessions`, `auth_accounts` (password hashes, scrypt) and `auth_verifications`, mapped onto our `users` table. IDs are UUID v7.
- **Sign-up:** disabled. Staff accounts are created only by an admin (ADM-001) or the bootstrap command. Unused endpoints (`/sign-up/email`, password reset, change email, delete user) are disabled.
- **Passwords:** 10–128 characters.
- **Sessions:** database sessions in an httpOnly cookie, 12-hour lifetime (one shift), refreshed hourly. Cookies are `Secure` when `BETTER_AUTH_URL` is https.
- **Lockout:** 5 consecutive failed sign-ins lock the account for 15 minutes. While it is locked, even the right password is refused. Counting runs under a row lock. A successful sign-in resets the count. The same "Invalid email or password." message is shown for unknown emails and wrong passwords.
- **Rate limit:** 10 sign-in requests per minute per IP, and 100 per minute for other auth endpoints. Rate-limit state is in memory, which is fine for a single app instance; it moves to the database or Redis if the app is scaled out.
- **Inactive users:** a session is never created for a user with `is_active = false` or an active lock (database hook).
- **Bootstrap (SPEC §26):** `pnpm admin:bootstrap --email … --name …`. The password comes from a hidden prompt or `BOOTSTRAP_ADMIN_PASSWORD`. In one transaction under an advisory lock, it refuses if any ADMIN exists, creates the default restaurant, branch, settings, VAT 14% and Cash/Card on an empty database (ADR-006), creates the user with the ADMIN role, and writes an audit entry. There is no default account and no predictable password.

## Consequences
- Role checks on routes and actions are AUTH-002 (ADR-008 matrix). AUTH-001 only distinguishes signed-in from signed-out.
- Tests reset a database whose name must end in `_test`.
