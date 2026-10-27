import { hashPassword } from "better-auth/crypto";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { sql } from "@/server/db/client";

// Creates the first administrator (SPEC §26) and, on an empty database, the default
// restaurant, branch and settings from ADR-006. Refuses to run once any admin exists.

export const bootstrapInput = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(1).max(100),
  password: z.string().min(10).max(128),
  restaurantNameAr: z.string().trim().min(1).default("مطعمي"),
  restaurantNameEn: z.string().trim().min(1).default("My Restaurant"),
});

export type BootstrapInput = z.input<typeof bootstrapInput>;

export class AdminAlreadyExistsError extends Error {
  constructor() {
    super("An administrator already exists. Use the admin panel to add users.");
  }
}

// Any constant works; it only serializes concurrent bootstrap runs.
const BOOTSTRAP_LOCK_KEY = 4_206_001;

export async function bootstrapAdmin(raw: BootstrapInput) {
  const input = bootstrapInput.parse(raw);
  const passwordHash = await hashPassword(input.password);

  return sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(${BOOTSTRAP_LOCK_KEY})`;

    const [{ count }] = await tx<{ count: number }[]>`select count(*)::int as count from user_roles where role = 'ADMIN'`;
    if (count > 0) throw new AdminAlreadyExistsError();

    let [branch] = await tx<{ id: string }[]>`select id from branches order by created_at limit 1`;
    if (!branch) {
      const restaurantId = uuidv7();
      const branchId = uuidv7();
      await tx`insert into restaurants (id, name_ar, name_en)
               values (${restaurantId}, ${input.restaurantNameAr}, ${input.restaurantNameEn})`;
      await tx`insert into branches (id, restaurant_id, name_ar, name_en, timezone, currency, default_language)
               values (${branchId}, ${restaurantId}, 'الفرع الرئيسي', 'Main branch', 'Africa/Cairo', 'EGP', 'ar')`;
      await tx`insert into branch_settings (branch_id) values (${branchId})`;
      await tx`insert into tax_rates (id, branch_id, name, rate_bps) values (${uuidv7()}, ${branchId}, 'VAT', 1400)`;
      await tx`insert into payment_methods (id, branch_id, code, name_ar, name_en) values
               (${uuidv7()}, ${branchId}, 'CASH', 'نقدي', 'Cash'),
               (${uuidv7()}, ${branchId}, 'CARD', 'بطاقة', 'Card')`;
      branch = { id: branchId };
    }

    const [existing] = await tx`select id from users where lower(email) = ${input.email}`;
    if (existing) throw new Error("A user with this email already exists.");

    const userId = uuidv7();
    await tx`insert into users (id, name, email, email_verified) values (${userId}, ${input.name}, ${input.email}, true)`;
    await tx`insert into auth_accounts (id, user_id, account_id, provider_id, password)
             values (${uuidv7()}, ${userId}, ${userId}, 'credential', ${passwordHash})`;
    await tx`insert into user_roles (user_id, branch_id, role) values (${userId}, ${branch.id}, 'ADMIN')`;
    await tx`insert into audit_logs (id, branch_id, actor_user_id, action, entity_type, entity_id, after)
             values (${uuidv7()}, ${branch.id}, null, 'ADMIN_BOOTSTRAPPED', 'user', ${userId},
                     ${JSON.stringify({ email: input.email, name: input.name })}::jsonb)`;

    return { userId, branchId: branch.id };
  });
}
