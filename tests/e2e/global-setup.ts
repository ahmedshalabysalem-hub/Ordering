import { execFileSync } from "node:child_process";
import { resetTestDatabase } from "../helpers/test-db";

export const E2E_ADMIN = { email: "e2e-admin@example.com", name: "E2E Admin", password: "e2e-password-123" };

// Fresh, migrated test database with one administrator created through the real bootstrap command.
export default async function globalSetup() {
  await resetTestDatabase();
  execFileSync("pnpm", ["--silent", "admin:bootstrap", "--email", E2E_ADMIN.email, "--name", E2E_ADMIN.name], {
    env: { ...process.env, BOOTSTRAP_ADMIN_PASSWORD: E2E_ADMIN.password },
    stdio: "inherit",
  });
}
