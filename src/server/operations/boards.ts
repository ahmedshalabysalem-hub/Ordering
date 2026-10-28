import { and, asc, desc, eq, gte, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { branchFor, type StaffUser } from "@/server/auth/permissions";
import { db } from "@/server/db/client";
import {
  assistanceRequests,
  branches,
  branchSettings,
  captainAssignments,
  captains,
  diningTables,
  menuCategories,
  orderItemModifiers,
  orderItems,
  orders,
  products,
  tableSessions,
} from "@/server/db/schema";
import { getTablesOverview, type TableOverview } from "@/server/sessions/service";

// Read models for the cashier grid and the kitchen screen (OPS-001, OPS-002). Staff screens re-read
// these on every real-time event (ADR-014), so they are plain queries without caching.

export type BoardItem = { name: string; quantity: number; options: string[]; note: string | null };

export type BoardOrder = {
  id: string;
  sessionId: string;
  orderRef: string;
  version: number;
  tableNumber: number;
  kitchenStatus: string;
  deliveryStatus: string;
  paymentStatus: string;
  totalMinor: number;
  paidMinor: number;
  createdAt: string;
  customerNote: string | null;
  cancelReason: string | null;
  captain: { id: string; name: string } | null;
  items: BoardItem[];
};

async function itemsFor(orderIds: string[]): Promise<Map<string, BoardItem[]>> {
  const byOrder = new Map<string, BoardItem[]>();
  if (orderIds.length === 0) return byOrder;
  const items = await db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds)).orderBy(asc(orderItems.id));
  const mods = items.length
    ? await db
        .select()
        .from(orderItemModifiers)
        .where(
          inArray(
            orderItemModifiers.orderItemId,
            items.map((i) => i.id),
          ),
        )
        .orderBy(asc(orderItemModifiers.id))
    : [];
  for (const i of items) {
    const list = byOrder.get(i.orderId) ?? [];
    list.push({
      name: i.nameEnSnapshot,
      quantity: i.quantity,
      options: mods.filter((m) => m.orderItemId === i.id).map((m) => `${m.groupNameEnSnapshot}: ${m.optionNameEnSnapshot}`),
      note: i.note,
    });
    byOrder.set(i.orderId, list);
  }
  return byOrder;
}

async function boardOrders(where: ReturnType<typeof and>, order: "asc" | "desc" = "asc"): Promise<BoardOrder[]> {
  const rows = await db
    .select({ order: orders, captainId: captains.id, captainName: captains.name })
    .from(orders)
    .leftJoin(captainAssignments, and(eq(captainAssignments.orderId, orders.id), isNull(captainAssignments.unassignedAt)))
    .leftJoin(captains, eq(captains.id, captainAssignments.captainId))
    .where(where)
    .orderBy(order === "asc" ? asc(orders.createdAt) : desc(orders.createdAt));
  const items = await itemsFor(rows.map((r) => r.order.id));
  return rows.map(({ order: o, captainId, captainName }) => ({
    id: o.id,
    sessionId: o.sessionId,
    orderRef: o.orderRef,
    version: o.version,
    tableNumber: o.tableNumberSnapshot,
    kitchenStatus: o.kitchenStatus,
    deliveryStatus: o.deliveryStatus,
    paymentStatus: o.paymentStatus,
    totalMinor: o.totalMinor,
    paidMinor: o.paidMinor,
    createdAt: o.createdAt.toISOString(),
    customerNote: o.customerNote,
    cancelReason: o.cancelReason,
    captain: captainId && captainName ? { id: captainId, name: captainName } : null,
    items: items.get(o.id) ?? [],
  }));
}

export type CashierTable = TableOverview & { openedAt: string | null; orders: BoardOrder[] };

export type CashierBoard = {
  currency: string;
  timezone: string;
  newOrderSound: boolean;
  tables: CashierTable[];
  assistance: { id: string; tableNumber: number; status: string; createdAt: string }[];
  captains: { id: string; name: string }[];
};

export async function getCashierBoard(staff: StaffUser): Promise<CashierBoard> {
  const branchId = branchFor(staff, "orders.view_operational");
  const [overview, [branch], sessionRows, assistance, captainRows] = await Promise.all([
    getTablesOverview(staff),
    db
      .select({ currency: branches.currency, timezone: branches.timezone, sound: branchSettings.newOrderSound })
      .from(branches)
      .leftJoin(branchSettings, eq(branchSettings.branchId, branches.id))
      .where(eq(branches.id, branchId)),
    db
      .select({ id: tableSessions.id, openedAt: tableSessions.openedAt })
      .from(tableSessions)
      .where(and(eq(tableSessions.branchId, branchId), ne(tableSessions.status, "CLOSED"))),
    db
      .select({ id: assistanceRequests.id, status: assistanceRequests.status, createdAt: assistanceRequests.createdAt, tableNumber: diningTables.number })
      .from(assistanceRequests)
      .innerJoin(diningTables, eq(diningTables.id, assistanceRequests.tableId))
      .where(and(eq(assistanceRequests.branchId, branchId), inArray(assistanceRequests.status, ["PENDING", "ACKNOWLEDGED"])))
      .orderBy(asc(assistanceRequests.createdAt)),
    db
      .select({ id: captains.id, name: captains.name })
      .from(captains)
      .where(and(eq(captains.branchId, branchId), eq(captains.isActive, true)))
      .orderBy(asc(captains.name)),
  ]);
  const sessionIds = sessionRows.map((s) => s.id);
  const live = sessionIds.length ? await boardOrders(and(eq(orders.branchId, branchId), inArray(orders.sessionId, sessionIds))) : [];
  const liveBySession = new Map<string, BoardOrder[]>();
  for (const o of live) liveBySession.set(o.sessionId, [...(liveBySession.get(o.sessionId) ?? []), o]);
  return {
    currency: branch.currency,
    timezone: branch.timezone,
    newOrderSound: branch.sound ?? true,
    tables: overview.map((t) => ({
      ...t,
      openedAt: t.session ? (sessionRows.find((s) => s.id === t.session!.id)?.openedAt.toISOString() ?? null) : null,
      orders: t.session ? (liveBySession.get(t.session.id) ?? []) : [],
    })),
    assistance: assistance.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
    captains: captainRows,
  };
}

export type KitchenBoard = {
  warnMinutes: number;
  overdueMinutes: number;
  tickets: BoardOrder[];
  products: { id: string; name: string; category: string; isAvailable: boolean }[];
};

export async function getKitchenBoard(staff: StaffUser): Promise<KitchenBoard> {
  const branchId = branchFor(staff, "kitchen.view");
  const [[settings], productRows] = await Promise.all([
    db.select().from(branchSettings).where(eq(branchSettings.branchId, branchId)),
    db
      .select({ id: products.id, name: products.nameEn, category: menuCategories.nameEn, isAvailable: products.isAvailable })
      .from(products)
      .innerJoin(menuCategories, eq(menuCategories.id, products.categoryId))
      .where(and(eq(products.branchId, branchId), eq(products.isActive, true)))
      .orderBy(asc(menuCategories.sortOrder), asc(products.sortOrder), asc(products.nameEn)),
  ]);
  // Active tickets, plus ready ones still waiting to be served from the last 12 hours.
  const tickets = await boardOrders(
    and(
      eq(orders.branchId, branchId),
      or(
        inArray(orders.kitchenStatus, ["NEW", "ACCEPTED", "IN_PREPARATION"]),
        and(eq(orders.kitchenStatus, "READY"), ne(orders.deliveryStatus, "DELIVERED"), gte(orders.createdAt, sql`now() - interval '12 hours'`)),
      ),
    ),
  );
  return {
    warnMinutes: settings?.prepWarnMinutes ?? 10,
    overdueMinutes: settings?.prepOverdueMinutes ?? 20,
    tickets,
    products: productRows,
  };
}
