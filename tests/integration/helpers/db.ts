import { randomBytes } from "node:crypto";
import type postgres from "postgres";
import { v7 as uuidv7 } from "uuid";
import { sql } from "@/server/db/client";

export { sql };

type Tx = postgres.TransactionSql;

class Rollback extends Error {}

/** Runs `fn` in a transaction that is always rolled back, so tests leave no data behind. */
export async function inRollback(fn: (tx: Tx) => Promise<void>) {
  try {
    await sql.begin(async (tx) => {
      await fn(tx);
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
}

/** Expects `fn` to fail with a constraint error; uses a savepoint so the outer transaction stays usable. */
export async function expectViolation(tx: Tx, fn: (sp: Tx) => Promise<unknown>, constraint: string) {
  let error: unknown;
  try {
    await tx.savepoint(async (sp) => {
      await fn(sp);
    });
  } catch (e) {
    error = e;
  }
  if (!error) throw new Error(`expected a violation of ${constraint}, but the statement succeeded`);
  const err = error as { constraint_name?: string; message?: string };
  if (err.constraint_name !== constraint && !err.message?.includes(constraint)) {
    throw new Error(`expected a violation of ${constraint}, got: ${err.message}`);
  }
}

export const token = () => randomBytes(32).toString("base64url");

/** Inserts a restaurant, branch, admin user and one table. Returns their ids. */
export async function seedBase(tx: Tx | typeof sql, tableNumber = 1) {
  const restaurantId = uuidv7();
  const branchId = uuidv7();
  const userId = uuidv7();
  const tableId = uuidv7();
  await tx`insert into restaurants (id, name_ar, name_en) values (${restaurantId}, 'مطعم', 'Restaurant')`;
  await tx`insert into branches (id, restaurant_id, name_ar, name_en, timezone, currency)
           values (${branchId}, ${restaurantId}, 'الفرع', 'Main', 'Africa/Cairo', 'EGP')`;
  await tx`insert into users (id, name, email) values (${userId}, 'Admin', ${`admin-${userId}@example.com`})`;
  await tx`insert into dining_tables (id, branch_id, number, qr_token) values (${tableId}, ${branchId}, ${tableNumber}, ${token()})`;
  return { restaurantId, branchId, userId, tableId };
}
