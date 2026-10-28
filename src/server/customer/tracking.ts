import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db/client";
import { branches, orderItemModifiers, orderItems, orders, restaurants } from "@/server/db/schema";

// Customer order tracking (UI-005, ADR-013, SPEC §7.1). The random tracking token is the only key:
// nothing here can be reached with a table number, order reference or order id.

export const TRACKING_TOKEN = /^[A-Za-z0-9_-]{32}$/;

export type TrackedOrder = {
  orderRef: string;
  tableNumber: number;
  createdAt: string;
  timezone: string;
  restaurant: { nameAr: string; nameEn: string; logoUrl: string | null };
  kitchenStatus: string;
  deliveryStatus: string;
  paymentStatus: string;
  currency: string;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  serviceMinor: number;
  totalMinor: number;
  paidMinor: number;
  customerNote: string | null;
  items: {
    nameAr: string;
    nameEn: string;
    quantity: number;
    unitPriceMinor: number;
    lineTotalMinor: number;
    note: string | null;
    options: { groupNameAr: string; groupNameEn: string; nameAr: string; nameEn: string; priceDeltaMinor: number }[];
  }[];
};

export async function getTrackedOrder(trackingToken: string): Promise<TrackedOrder | null> {
  if (!TRACKING_TOKEN.test(trackingToken)) return null;
  const [row] = await db
    .select({
      order: orders,
      timezone: branches.timezone,
      nameAr: restaurants.nameAr,
      nameEn: restaurants.nameEn,
      logoUrl: restaurants.logoUrl,
    })
    .from(orders)
    .innerJoin(branches, eq(branches.id, orders.branchId))
    .innerJoin(restaurants, eq(restaurants.id, branches.restaurantId))
    .where(eq(orders.trackingToken, trackingToken));
  if (!row) return null;
  const o = row.order;

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, o.id)).orderBy(asc(orderItems.id));
  const modifiers = items.length
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

  return {
    orderRef: o.orderRef,
    tableNumber: o.tableNumberSnapshot,
    createdAt: new Date(o.createdAt).toISOString(),
    timezone: row.timezone,
    restaurant: { nameAr: row.nameAr, nameEn: row.nameEn, logoUrl: row.logoUrl },
    kitchenStatus: o.kitchenStatus,
    deliveryStatus: o.deliveryStatus,
    paymentStatus: o.paymentStatus,
    currency: o.currency,
    subtotalMinor: o.subtotalMinor,
    discountMinor: o.discountMinor,
    taxMinor: o.taxMinor,
    serviceMinor: o.serviceMinor,
    totalMinor: o.totalMinor,
    paidMinor: o.paidMinor,
    customerNote: o.customerNote,
    items: items.map((i) => ({
      nameAr: i.nameArSnapshot,
      nameEn: i.nameEnSnapshot,
      quantity: i.quantity,
      unitPriceMinor: i.unitPriceMinor,
      lineTotalMinor: i.lineTotalMinor,
      note: i.note,
      options: modifiers
        .filter((m) => m.orderItemId === i.id)
        .map((m) => ({
          groupNameAr: m.groupNameArSnapshot,
          groupNameEn: m.groupNameEnSnapshot,
          nameAr: m.optionNameArSnapshot,
          nameEn: m.optionNameEnSnapshot,
          priceDeltaMinor: m.priceDeltaMinor,
        })),
    })),
  };
}

/** The order behind a tracking token, for the customer's live-update stream. */
export async function findTrackedOrderId(trackingToken: string): Promise<string | null> {
  if (!TRACKING_TOKEN.test(trackingToken)) return null;
  const [row] = await db.select({ id: orders.id }).from(orders).where(eq(orders.trackingToken, trackingToken));
  return row?.id ?? null;
}
