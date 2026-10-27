import { afterAll, describe, expect, it } from "vitest";
import { v7 as uuidv7 } from "uuid";
import { expectViolation, inRollback, seedBase, sql, token } from "./helpers/db";

afterAll(async () => {
  await sql.end();
});

describe("dining tables and permanent QR tokens (ADR-004)", () => {
  it("rejects a duplicate table number in the same branch", async () => {
    await inRollback(async (tx) => {
      const { branchId } = await seedBase(tx, 12);
      await expectViolation(
        tx,
        (sp) => sp`insert into dining_tables (branch_id, id, number, qr_token) values (${branchId}, ${uuidv7()}, 12, ${token()})`,
        "dining_tables_branch_number_uq",
      );
    });
  });

  it("rejects a duplicate QR token", async () => {
    await inRollback(async (tx) => {
      const { branchId, tableId } = await seedBase(tx, 1);
      const [{ qr_token }] = await tx`select qr_token from dining_tables where id = ${tableId}`;
      await expectViolation(
        tx,
        (sp) => sp`insert into dining_tables (id, branch_id, number, qr_token) values (${uuidv7()}, ${branchId}, 2, ${qr_token})`,
        "dining_tables_qr_token_uq",
      );
    });
  });
});

describe("table sessions", () => {
  it("allows only one open session per table, and a new one after closing, without touching the QR token", async () => {
    await inRollback(async (tx) => {
      const { branchId, tableId, userId } = await seedBase(tx);
      const [{ qr_token: before }] = await tx`select qr_token from dining_tables where id = ${tableId}`;

      const first = uuidv7();
      await tx`insert into table_sessions (id, branch_id, table_id) values (${first}, ${branchId}, ${tableId})`;
      await expectViolation(
        tx,
        (sp) => sp`insert into table_sessions (id, branch_id, table_id) values (${uuidv7()}, ${branchId}, ${tableId})`,
        "table_sessions_one_open_per_table_uq",
      );

      await tx`update table_sessions set status = 'CLOSED', closed_at = now(), closed_by = ${userId} where id = ${first}`;
      await tx`insert into table_sessions (id, branch_id, table_id) values (${uuidv7()}, ${branchId}, ${tableId})`;

      const [{ qr_token: after }] = await tx`select qr_token from dining_tables where id = ${tableId}`;
      expect(after).toBe(before);
    });
  });

  it("requires closed_at exactly when the session is CLOSED", async () => {
    await inRollback(async (tx) => {
      const { branchId, tableId } = await seedBase(tx);
      await expectViolation(
        tx,
        (sp) => sp`insert into table_sessions (id, branch_id, table_id, status) values (${uuidv7()}, ${branchId}, ${tableId}, 'CLOSED')`,
        "table_sessions_closed_fields",
      );
    });
  });
});

describe("orders", () => {
  async function seedSession(tx: Parameters<Parameters<typeof inRollback>[0]>[0]) {
    const base = await seedBase(tx, 12);
    const sessionId = uuidv7();
    await tx`insert into table_sessions (id, branch_id, table_id) values (${sessionId}, ${base.branchId}, ${base.tableId})`;
    return { ...base, sessionId };
  }

  const insertOrder = (
    tx: Parameters<Parameters<typeof inRollback>[0]>[0],
    s: { branchId: string; sessionId: string; tableId: string },
    o: { seq: number; ref: string; subtotal: number; tax: number; total: number; kitchen?: string },
  ) => tx`
    insert into orders (id, branch_id, session_id, table_id, table_number_snapshot, business_date, seq, order_ref,
                        tracking_token, currency, subtotal_minor, tax_minor, total_minor, kitchen_status)
    values (${uuidv7()}, ${s.branchId}, ${s.sessionId}, ${s.tableId}, 12, '2026-10-27', ${o.seq}, ${o.ref},
            ${token()}, 'EGP', ${o.subtotal}, ${o.tax}, ${o.total}, ${o.kitchen ?? "NEW"})`;

  it("accepts consistent totals and rejects inconsistent ones", async () => {
    await inRollback(async (tx) => {
      const s = await seedSession(tx);
      await insertOrder(tx, s, { seq: 1, ref: "20261027-T012-0001", subtotal: 10000, tax: 1400, total: 11400 });
      await expectViolation(
        tx,
        (sp) => insertOrder(sp, s, { seq: 2, ref: "20261027-T012-0002", subtotal: 10000, tax: 1400, total: 100 }),
        "orders_total_consistent",
      );
    });
  });

  it("rejects duplicate order references within a branch and duplicate table/date/seq", async () => {
    await inRollback(async (tx) => {
      const s = await seedSession(tx);
      await insertOrder(tx, s, { seq: 1, ref: "20261027-T012-0001", subtotal: 0, tax: 0, total: 0 });
      await expectViolation(
        tx,
        (sp) => insertOrder(sp, s, { seq: 2, ref: "20261027-T012-0001", subtotal: 0, tax: 0, total: 0 }),
        "orders_branch_order_ref_uq",
      );
      await expectViolation(
        tx,
        (sp) => insertOrder(sp, s, { seq: 1, ref: "20261027-T012-9999", subtotal: 0, tax: 0, total: 0 }),
        "orders_table_date_seq_uq",
      );
    });
  });

  it("rejects an unknown kitchen status", async () => {
    await inRollback(async (tx) => {
      const s = await seedSession(tx);
      await expectViolation(
        tx,
        (sp) => insertOrder(sp, s, { seq: 1, ref: "x", subtotal: 0, tax: 0, total: 0, kitchen: "DONE" }),
        "orders_kitchen_status",
      );
    });
  });

  it("rejects an order line whose total does not match price × quantity", async () => {
    await inRollback(async (tx) => {
      const s = await seedSession(tx);
      const [order] = await insertOrder(tx, s, { seq: 1, ref: "r1", subtotal: 0, tax: 0, total: 0 }).then(
        () => tx`select id from orders where order_ref = 'r1'`,
      );
      const categoryId = uuidv7();
      const productId = uuidv7();
      await tx`insert into menu_categories (id, branch_id, name_ar, name_en) values (${categoryId}, ${s.branchId}, 'قهوة', 'Coffee')`;
      await tx`insert into products (id, branch_id, category_id, name_ar, name_en, price_minor)
               values (${productId}, ${s.branchId}, ${categoryId}, 'لاتيه', 'Latte', 5000)`;
      await expectViolation(
        tx,
        (sp) => sp`insert into order_items (id, order_id, product_id, name_ar_snapshot, name_en_snapshot, unit_price_minor,
                                            quantity, modifiers_total_minor, line_total_minor)
                   values (${uuidv7()}, ${order.id}, ${productId}, 'لاتيه', 'Latte', 5000, 2, 500, 10000)`,
        "order_items_line_total",
      );
    });
  });
});

describe("order number allocation", () => {
  it("hands out unique, gap-free sequence numbers under concurrent requests", async () => {
    const base = await seedBase(sql, 99);
    try {
      const allocate = () =>
        sql.begin(async (tx) => {
          const [row] = await tx`
            insert into order_counters (table_id, business_date, last_seq) values (${base.tableId}, '2026-10-27', 1)
            on conflict (table_id, business_date) do update set last_seq = order_counters.last_seq + 1
            returning last_seq`;
          return row.last_seq as number;
        });
      const seqs = await Promise.all(Array.from({ length: 20 }, allocate));
      expect([...seqs].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    } finally {
      await sql`delete from order_counters where table_id = ${base.tableId}`;
      await sql`delete from dining_tables where id = ${base.tableId}`;
      await sql`delete from users where id = ${base.userId}`;
      await sql`delete from branches where id = ${base.branchId}`;
      await sql`delete from restaurants where id = ${base.restaurantId}`;
    }
  });
});

describe("captains, assistance and payments", () => {
  it("keeps one current captain assignment per order while preserving history", async () => {
    await inRollback(async (tx) => {
      const s = await seedBase(tx, 5);
      const sessionId = uuidv7();
      const orderId = uuidv7();
      const captainA = uuidv7();
      const captainB = uuidv7();
      await tx`insert into table_sessions (id, branch_id, table_id) values (${sessionId}, ${s.branchId}, ${s.tableId})`;
      await tx`insert into orders (id, branch_id, session_id, table_id, table_number_snapshot, business_date, seq, order_ref,
                                   tracking_token, currency, subtotal_minor, total_minor)
               values (${orderId}, ${s.branchId}, ${sessionId}, ${s.tableId}, 5, '2026-10-27', 1, 'c1', ${token()}, 'EGP', 0, 0)`;
      await tx`insert into captains (id, branch_id, name) values (${captainA}, ${s.branchId}, 'A'), (${captainB}, ${s.branchId}, 'B')`;
      await tx`insert into captain_assignments (order_id, id, captain_id, assigned_by) values (${orderId}, ${uuidv7()}, ${captainA}, ${s.userId})`;
      await expectViolation(
        tx,
        (sp) => sp`insert into captain_assignments (id, order_id, captain_id, assigned_by) values (${uuidv7()}, ${orderId}, ${captainB}, ${s.userId})`,
        "captain_assignments_one_current_uq",
      );
      await tx`update captain_assignments set unassigned_at = now() where order_id = ${orderId}`;
      await tx`insert into captain_assignments (id, order_id, captain_id, assigned_by) values (${uuidv7()}, ${orderId}, ${captainB}, ${s.userId})`;
      const rows = await tx`select captain_id from captain_assignments where order_id = ${orderId}`;
      expect(rows).toHaveLength(2);
    });
  });

  it("allows only one pending assistance request per table", async () => {
    await inRollback(async (tx) => {
      const s = await seedBase(tx, 6);
      await tx`insert into assistance_requests (id, branch_id, table_id) values (${uuidv7()}, ${s.branchId}, ${s.tableId})`;
      await expectViolation(
        tx,
        (sp) => sp`insert into assistance_requests (id, branch_id, table_id) values (${uuidv7()}, ${s.branchId}, ${s.tableId})`,
        "assistance_requests_one_pending_uq",
      );
    });
  });

  it("requires a positive amount and a reason for refunds", async () => {
    await inRollback(async (tx) => {
      const s = await seedBase(tx, 7);
      const sessionId = uuidv7();
      const orderId = uuidv7();
      const methodId = uuidv7();
      await tx`insert into table_sessions (id, branch_id, table_id) values (${sessionId}, ${s.branchId}, ${s.tableId})`;
      await tx`insert into orders (id, branch_id, session_id, table_id, table_number_snapshot, business_date, seq, order_ref,
                                   tracking_token, currency, subtotal_minor, total_minor)
               values (${orderId}, ${s.branchId}, ${sessionId}, ${s.tableId}, 7, '2026-10-27', 1, 'p1', ${token()}, 'EGP', 5000, 5000)`;
      await tx`insert into payment_methods (id, branch_id, code, name_ar, name_en) values (${methodId}, ${s.branchId}, 'CASH', 'نقدي', 'Cash')`;
      const pay = (sp: typeof tx, kind: string, amount: number, reason: string | null) =>
        sp`insert into payments (id, order_id, method_id, kind, amount_minor, currency, reason, recorded_by)
           values (${uuidv7()}, ${orderId}, ${methodId}, ${kind}, ${amount}, 'EGP', ${reason}, ${s.userId})`;
      await pay(tx, "PAYMENT", 5000, null);
      await expectViolation(tx, (sp) => pay(sp, "PAYMENT", 0, null), "payments_amount_positive");
      await expectViolation(tx, (sp) => pay(sp, "REFUND", 1000, null), "payments_refund_reason");
      await pay(tx, "REFUND", 1000, "Wrong item");
    });
  });
});

describe("audit log", () => {
  it("is insert-only", async () => {
    await inRollback(async (tx) => {
      const id = uuidv7();
      await tx`insert into audit_logs (id, action, entity_type) values (${id}, 'TEST', 'test')`;
      await expectViolation(tx, (sp) => sp`update audit_logs set action = 'X' where id = ${id}`, "audit_logs is insert-only");
      await expectViolation(tx, (sp) => sp`delete from audit_logs where id = ${id}`, "audit_logs is insert-only");
    });
  });
});
