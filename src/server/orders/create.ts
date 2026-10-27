import { createHash, randomBytes } from "node:crypto";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { db } from "@/server/db/client";
import {
  branches,
  branchSettings,
  diningTables,
  idempotencyKeys,
  menuCategories,
  modifierGroups,
  modifierOptions,
  orderEvents,
  orderItemModifiers,
  orderItems,
  orders,
  productModifierGroups,
  products,
  tableSessions,
  taxRates,
} from "@/server/db/schema";
import { checkModifierSelection, type SelectableGroup, type SelectionProblem } from "@/server/menu/selection";
import { lineTotalMinor, type OrderTotals, priceOrder } from "./pricing";

// Customer order creation from a table QR code (ORD-001, ADR-012). The table comes only from the QR
// token (ADR-004); every price is recomputed here from the current menu.

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | Tx;

export const QR_TOKEN = /^[A-Za-z0-9_-]{16,64}$/;
export const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{16,64}$/;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);

export const orderRequest = z.object({
  qrToken: z.string().regex(QR_TOKEN),
  items: z
    .array(
      z.object({
        productId: z.uuid(),
        quantity: z.number().int().min(1).max(50),
        optionIds: z.array(z.uuid()).max(30).default([]),
        note: optionalText(200),
      }),
    )
    .min(1)
    .max(50),
  customerNote: optionalText(500),
  expectedTotalMinor: z.number().int().min(0).optional(),
});

export type OrderRequest = z.input<typeof orderRequest>;
type ParsedRequest = z.output<typeof orderRequest>;

export type ItemProblem =
  | { itemIndex: number; kind: "product_unavailable" | "product_sold_out" }
  | ({ itemIndex: number } & SelectionProblem);

export type OrderErrorCode =
  | "TABLE_NOT_FOUND"
  | "TABLE_INACTIVE"
  | "SESSION_CLOSING"
  | "ITEMS_UNAVAILABLE"
  | "INVALID_OPTIONS"
  | "PRICES_CHANGED"
  | "IDEMPOTENCY_CONFLICT";

export class OrderError extends Error {
  constructor(
    readonly code: OrderErrorCode,
    message: string,
    readonly details: { problems?: ItemProblem[]; quote?: Quote } = {},
  ) {
    super(message);
  }

  get status(): 404 | 409 {
    return this.code === "TABLE_NOT_FOUND" ? 404 : 409;
  }
}

export type QuoteLine = {
  productId: string;
  nameAr: string;
  nameEn: string;
  unitPriceMinor: number;
  quantity: number;
  modifiersTotalMinor: number;
  lineTotalMinor: number;
  note: string | null;
  options: { optionId: string; groupNameAr: string; groupNameEn: string; nameAr: string; nameEn: string; priceDeltaMinor: number }[];
};

export type Quote = { currency: string; lines: QuoteLine[]; totals: OrderTotals };

export type CreatedOrder = {
  orderId: string;
  orderRef: string;
  trackingToken: string;
  currency: string;
  totals: OrderTotals;
};

type TableContext = { tableId: string; tableNumber: number; isActive: boolean; branchId: string; timezone: string; currency: string };

async function findTable(ex: Executor, qrToken: string, lock: boolean): Promise<TableContext> {
  const query = ex
    .select({
      tableId: diningTables.id,
      tableNumber: diningTables.number,
      isActive: diningTables.isActive,
      branchId: branches.id,
      timezone: branches.timezone,
      currency: branches.currency,
    })
    .from(diningTables)
    .innerJoin(branches, eq(branches.id, diningTables.branchId))
    .where(eq(diningTables.qrToken, qrToken));
  // The table row lock serialises all orders for one table: session, number and idempotency.
  const [table] = lock ? await query.for("update", { of: diningTables }) : await query;
  if (!table) throw new OrderError("TABLE_NOT_FOUND", "This QR code is not valid.");
  if (!table.isActive) throw new OrderError("TABLE_INACTIVE", "This table is not taking orders right now.");
  return table;
}

/** Prices the cart from the current menu, or throws OrderError listing every problem. */
async function buildQuote(ex: Executor, table: TableContext, request: ParsedRequest): Promise<Quote> {
  const productIds = [...new Set(request.items.map((i) => i.productId))];
  const [productRows, links, settingsRows, taxRows] = await Promise.all([
    ex
      .select({ product: products, categoryActive: menuCategories.isActive })
      .from(products)
      .innerJoin(menuCategories, eq(menuCategories.id, products.categoryId))
      .where(and(inArray(products.id, productIds), eq(products.branchId, table.branchId))),
    ex
      .select({ productId: productModifierGroups.productId, group: modifierGroups })
      .from(productModifierGroups)
      .innerJoin(modifierGroups, eq(modifierGroups.id, productModifierGroups.groupId))
      .where(inArray(productModifierGroups.productId, productIds))
      .orderBy(asc(productModifierGroups.sortOrder)),
    ex.select().from(branchSettings).where(eq(branchSettings.branchId, table.branchId)),
    ex
      .select({ rateBps: taxRates.rateBps })
      .from(taxRates)
      .where(and(eq(taxRates.branchId, table.branchId), eq(taxRates.isActive, true))),
  ]);
  const groupIds = [...new Set(links.map((l) => l.group.id))];
  const optionRows = groupIds.length
    ? await ex.select().from(modifierOptions).where(inArray(modifierOptions.groupId, groupIds)).orderBy(asc(modifierOptions.sortOrder))
    : [];

  const productById = new Map(productRows.map((r) => [r.product.id, r]));
  const groupsFor = (productId: string) =>
    links
      .filter((l) => l.productId === productId)
      .map((l) => ({ ...l.group, options: optionRows.filter((o) => o.groupId === l.group.id) }));

  const problems: ItemProblem[] = [];
  const lines: QuoteLine[] = [];
  request.items.forEach((item, itemIndex) => {
    const row = productById.get(item.productId);
    if (!row || !row.product.isActive || !row.categoryActive) {
      problems.push({ itemIndex, kind: "product_unavailable" });
      return;
    }
    if (!row.product.isAvailable) {
      problems.push({ itemIndex, kind: "product_sold_out" });
      return;
    }
    const groups = groupsFor(item.productId);
    const selection = checkModifierSelection(groups satisfies SelectableGroup[], item.optionIds);
    if (!selection.ok) {
      problems.push(...selection.problems.map((p) => ({ itemIndex, ...p })));
      return;
    }
    const chosen = groups.flatMap((g) =>
      g.options
        .filter((o) => selection.optionIds.includes(o.id))
        .map((o) => ({
          optionId: o.id,
          groupNameAr: g.nameAr,
          groupNameEn: g.nameEn,
          nameAr: o.nameAr,
          nameEn: o.nameEn,
          priceDeltaMinor: o.priceDeltaMinor,
        })),
    );
    const line = { unitPriceMinor: row.product.priceMinor, modifiersTotalMinor: selection.modifiersTotalMinor, quantity: item.quantity };
    lines.push({
      productId: row.product.id,
      nameAr: row.product.nameAr,
      nameEn: row.product.nameEn,
      ...line,
      lineTotalMinor: lineTotalMinor(line),
      note: item.note,
      options: chosen,
    });
  });

  if (problems.length > 0) {
    const productProblem = problems.some((p) => p.kind === "product_unavailable" || p.kind === "product_sold_out");
    throw productProblem
      ? new OrderError("ITEMS_UNAVAILABLE", "Some items are no longer available.", { problems })
      : new OrderError("INVALID_OPTIONS", "Some option choices need attention.", { problems });
  }

  const settings = settingsRows[0];
  const totals = priceOrder(lines, {
    taxBps: taxRows.reduce((sum, t) => sum + t.rateBps, 0),
    pricesIncludeTax: settings?.pricesIncludeTax ?? false,
    serviceChargeBps: settings?.serviceChargeBps ?? 0,
  });
  return { currency: table.currency, lines, totals };
}

/** Prices a cart without writing anything (cart screen). */
export async function quoteOrder(raw: OrderRequest): Promise<Quote> {
  const request = orderRequest.parse(raw);
  const table = await findTable(db, request.qrToken, false);
  return buildQuote(db, table, request);
}

const requestHash = (request: ParsedRequest) => createHash("sha256").update(JSON.stringify(request)).digest("hex");

export const formatOrderRef = (businessDate: string, tableNumber: number, seq: number) =>
  `${businessDate.replaceAll("-", "")}-T${String(tableNumber).padStart(3, "0")}-${String(seq).padStart(4, "0")}`;

/**
 * Creates a customer order in one transaction (ADR-012). Replaying the same idempotency key with the
 * same request returns the original order instead of creating a second one.
 */
export async function createOrder(raw: OrderRequest, idempotencyKey: string): Promise<CreatedOrder> {
  const request = orderRequest.parse(raw);
  const key = z.string().regex(IDEMPOTENCY_KEY).parse(idempotencyKey);
  const hash = requestHash(request);

  return db.transaction(async (tx) => {
    const table = await findTable(tx, request.qrToken, true);
    const scope = `order:${table.tableId}`;

    const [previous] = await tx
      .select()
      .from(idempotencyKeys)
      .where(and(eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key)));
    if (previous) {
      if (previous.requestHash !== hash) {
        throw new OrderError("IDEMPOTENCY_CONFLICT", "This submission key was already used for a different order.");
      }
      return previous.response as CreatedOrder;
    }

    const [openSession] = await tx
      .select({ id: tableSessions.id, status: tableSessions.status })
      .from(tableSessions)
      .where(and(eq(tableSessions.tableId, table.tableId), ne(tableSessions.status, "CLOSED")));
    if (openSession?.status === "CLOSING") {
      throw new OrderError("SESSION_CLOSING", "This table is being closed. Please ask a member of staff.");
    }

    const quote = await buildQuote(tx, table, request);
    if (request.expectedTotalMinor !== undefined && request.expectedTotalMinor !== quote.totals.totalMinor) {
      throw new OrderError("PRICES_CHANGED", "Prices have changed. Please review your order.", { quote });
    }

    const sessionId =
      openSession?.id ??
      (await tx.insert(tableSessions).values({ id: uuidv7(), branchId: table.branchId, tableId: table.tableId }).returning())[0].id;

    const [{ businessDate }] = await tx.execute<{ businessDate: string }>(
      sql`select to_char(now() at time zone ${table.timezone}, 'YYYY-MM-DD') as "businessDate"`,
    );

    // A renumbered table can meet an earlier table's reference on the same day; take the next number.
    let seq = 0;
    let orderRef = "";
    for (let attempt = 0; attempt < 20; attempt++) {
      const [counter] = await tx.execute<{ last_seq: number }>(sql`
        insert into order_counters (table_id, business_date, last_seq) values (${table.tableId}, ${businessDate}, 1)
        on conflict (table_id, business_date) do update set last_seq = order_counters.last_seq + 1
        returning last_seq`);
      seq = Number(counter.last_seq);
      orderRef = formatOrderRef(businessDate, table.tableNumber, seq);
      const [taken] = await tx
        .select({ id: orders.id })
        .from(orders)
        .where(and(eq(orders.branchId, table.branchId), eq(orders.orderRef, orderRef)));
      if (!taken) break;
      if (attempt === 19) throw new Error(`Could not allocate an order number for table ${table.tableNumber}.`);
    }

    const orderId = uuidv7();
    const trackingToken = randomBytes(24).toString("base64url");
    await tx.insert(orders).values({
      id: orderId,
      branchId: table.branchId,
      sessionId,
      tableId: table.tableId,
      tableNumberSnapshot: table.tableNumber,
      businessDate,
      seq,
      orderRef,
      trackingToken,
      currency: quote.currency,
      ...quote.totals,
      customerNote: request.customerNote,
    });

    for (const line of quote.lines) {
      const itemId = uuidv7();
      await tx.insert(orderItems).values({
        id: itemId,
        orderId,
        productId: line.productId,
        nameArSnapshot: line.nameAr,
        nameEnSnapshot: line.nameEn,
        unitPriceMinor: line.unitPriceMinor,
        quantity: line.quantity,
        modifiersTotalMinor: line.modifiersTotalMinor,
        lineTotalMinor: line.lineTotalMinor,
        note: line.note,
      });
      if (line.options.length > 0) {
        await tx.insert(orderItemModifiers).values(
          line.options.map((o) => ({
            id: uuidv7(),
            orderItemId: itemId,
            optionId: o.optionId,
            groupNameArSnapshot: o.groupNameAr,
            groupNameEnSnapshot: o.groupNameEn,
            optionNameArSnapshot: o.nameAr,
            optionNameEnSnapshot: o.nameEn,
            priceDeltaMinor: o.priceDeltaMinor,
          })),
        );
      }
    }

    await tx.insert(orderEvents).values({ id: uuidv7(), orderId, type: "ORDER_CREATED", toStatus: "NEW", data: { orderRef } });

    const created: CreatedOrder = { orderId, orderRef, trackingToken, currency: quote.currency, totals: quote.totals };
    await tx.insert(idempotencyKeys).values({ scope, key, requestHash: hash, response: created });
    return created;
  });
}
