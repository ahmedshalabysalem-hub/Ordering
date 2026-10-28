import { sql } from "drizzle-orm";
import { AuthError, can, type StaffUser } from "@/server/auth/permissions";
import { db } from "@/server/db/client";

// Reports (ADM-005, SPEC §22, ADR-017). Every figure comes from stored rows; nothing is estimated.
// The period is a range of business dates (orders.business_date, fixed in the branch time zone when the
// order was placed), and money figures follow the orders of that period:
//   - Gross order value: item subtotals of non-cancelled orders (before discount, tax and service).
//   - Order total: what the customer owes = gross − discounts + tax + service.
//   - Recorded payments / refunds: payment rows recorded against those orders.
//   - Net recorded sales: recorded payments − refunds.
//   - Outstanding: order total not yet covered by net payments, for non-cancelled orders.
// Unpaid orders are never counted as collected. Operational viewers (cashiers) see the last 7 days only.

export class ReportError extends Error {}

export const OPERATIONAL_DAYS = 7;
const MAX_DAYS = 366;

export type ReportRange = { from: string; to: string };

type Access = { branchId: string; full: boolean };

function access(staff: StaffUser): Access {
  for (const r of staff.roles) {
    if (can(staff, "reports.view_all", r.branchId)) return { branchId: r.branchId, full: true };
  }
  for (const r of staff.roles) {
    if (can(staff, "reports.view_operational", r.branchId)) return { branchId: r.branchId, full: false };
  }
  throw new AuthError(403);
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (date: string, days: number) => isoDate(new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000));
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** Today's business date in the branch time zone. */
async function branchToday(branchId: string): Promise<{ today: string; currency: string; timezone: string }> {
  const [row] = await db.execute<{ today: string; currency: string; timezone: string }>(
    sql`select to_char(now() at time zone timezone, 'YYYY-MM-DD') as today, currency, timezone from branches where id = ${branchId}`,
  );
  if (!row) throw new ReportError("Branch not found.");
  return row;
}

/** Validates and clamps a requested range. Missing dates default to today. */
export function resolveRange(requested: Partial<ReportRange>, today: string, full: boolean): ReportRange & { clamped: boolean } {
  const valid = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && isoDate(new Date(`${d}T00:00:00Z`)) === d ? d : undefined);
  let to = valid(requested.to) ?? today;
  let from = valid(requested.from) ?? to;
  if (from > to) [from, to] = [to, from];
  let clamped = false;
  if (daysBetween(from, to) >= MAX_DAYS) {
    from = addDays(to, -(MAX_DAYS - 1));
    clamped = true;
  }
  if (!full) {
    const earliest = addDays(today, -(OPERATIONAL_DAYS - 1));
    if (to > today) to = today;
    if (from < earliest) {
      from = earliest;
      clamped = true;
    }
    if (to < from) to = from;
  }
  return { from, to, clamped };
}

/** Sums come back from PostgreSQL as text (numeric/bigint); keep them exact integers. */
function int(v: unknown): number {
  const n = Number(v ?? 0);
  if (!Number.isSafeInteger(n)) throw new ReportError("A total is too large to show exactly.");
  return n;
}

export type MoneyTotals = {
  orders: number;
  cancelled: number;
  grossMinor: number;
  discountMinor: number;
  taxMinor: number;
  serviceMinor: number;
  totalMinor: number;
  paymentsMinor: number;
  refundsMinor: number;
  netMinor: number;
  outstandingMinor: number;
};

export type Report = {
  currency: string;
  timezone: string;
  range: ReportRange;
  clamped: boolean;
  full: boolean;
  totals: MoneyTotals;
  daily: ({ date: string } & MoneyTotals)[];
  byTable: { tableNumber: number; orders: number; totalMinor: number }[];
  byStatus: { status: string; orders: number }[];
  byPaymentMethod: { method: string; paymentsMinor: number; refundsMinor: number; netMinor: number; count: number }[];
  topProducts: { name: string; quantity: number; revenueMinor: number }[];
  categories: { name: string; quantity: number; revenueMinor: number }[];
  timing: { prepOrders: number; avgPrepSeconds: number | null; completedOrders: number; avgCompletionSeconds: number | null };
  captains: { name: string; assigned: number; delivered: number; avgDeliverySeconds: number | null }[];
  /** Orders per responsible chef (ADR-018); prep time is placed → ready. Cancelled orders are left out. */
  chefs: { name: string; orders: number; ready: number; avgPrepSeconds: number | null }[];
  cancelled: { orderRef: string; tableNumber: number; reason: string | null; totalMinor: number; createdAt: Date }[];
};

const totalsOf = (r: Record<string, unknown>): MoneyTotals => {
  const paymentsMinor = int(r.payments);
  const refundsMinor = int(r.refunds);
  return {
    orders: int(r.orders),
    cancelled: int(r.cancelled),
    grossMinor: int(r.gross),
    discountMinor: int(r.discount),
    taxMinor: int(r.tax),
    serviceMinor: int(r.service),
    totalMinor: int(r.total),
    paymentsMinor,
    refundsMinor,
    netMinor: paymentsMinor - refundsMinor,
    outstandingMinor: int(r.outstanding),
  };
};

export async function getReport(staff: StaffUser, requested: Partial<ReportRange>): Promise<Report> {
  const { branchId, full } = access(staff);
  const { today, currency, timezone } = await branchToday(branchId);
  const { from, to, clamped } = resolveRange(requested, today, full);
  const inRange = sql`o.branch_id = ${branchId} and o.business_date between ${from}::date and ${to}::date`;
  const live = sql`o.kitchen_status <> 'CANCELLED'`;

  // One row per order with its payment totals, reused by the money queries.
  const orderMoney = sql`
    select o.*,
      coalesce((select sum(p.amount_minor) from payments p where p.order_id = o.id and p.kind = 'PAYMENT'), 0) as pay,
      coalesce((select sum(p.amount_minor) from payments p where p.order_id = o.id and p.kind = 'REFUND'), 0) as ref
    from orders o where ${inRange}`;
  const moneyColumns = sql`
    count(*) as orders,
    count(*) filter (where kitchen_status = 'CANCELLED') as cancelled,
    coalesce(sum(subtotal_minor) filter (where kitchen_status <> 'CANCELLED'), 0)::bigint as gross,
    coalesce(sum(discount_minor) filter (where kitchen_status <> 'CANCELLED'), 0)::bigint as discount,
    coalesce(sum(tax_minor) filter (where kitchen_status <> 'CANCELLED'), 0)::bigint as tax,
    coalesce(sum(service_minor) filter (where kitchen_status <> 'CANCELLED'), 0)::bigint as service,
    coalesce(sum(total_minor) filter (where kitchen_status <> 'CANCELLED'), 0)::bigint as total,
    coalesce(sum(pay), 0)::bigint as payments,
    coalesce(sum(ref), 0)::bigint as refunds,
    coalesce(sum(greatest(total_minor - (pay - ref), 0)) filter (where kitchen_status <> 'CANCELLED'), 0)::bigint as outstanding`;

  const [totals, daily, byTable, byStatus, byMethod, topProducts, categories, timing, captains, chefRows, cancelled] = await Promise.all([
    db.execute(sql`select ${moneyColumns} from (${orderMoney}) m`),
    db.execute(sql`select to_char(business_date, 'YYYY-MM-DD') as date, ${moneyColumns} from (${orderMoney}) m group by business_date order by business_date`),
    db.execute(sql`
      select o.table_number_snapshot as table_number, count(*) as orders, coalesce(sum(o.total_minor), 0)::bigint as total
      from orders o where ${inRange} and ${live} group by o.table_number_snapshot order by o.table_number_snapshot`),
    db.execute(sql`select o.kitchen_status as status, count(*) as orders from orders o where ${inRange} group by o.kitchen_status order by count(*) desc`),
    db.execute(sql`
      select pm.name_en as method,
        coalesce(sum(p.amount_minor) filter (where p.kind = 'PAYMENT'), 0)::bigint as payments,
        coalesce(sum(p.amount_minor) filter (where p.kind = 'REFUND'), 0)::bigint as refunds,
        count(*) filter (where p.kind = 'PAYMENT') as count
      from payments p join orders o on o.id = p.order_id join payment_methods pm on pm.id = p.method_id
      where ${inRange} group by pm.name_en order by payments desc`),
    db.execute(sql`
      select i.name_en_snapshot as name, sum(i.quantity) as quantity, sum(i.line_total_minor)::bigint as revenue
      from order_items i join orders o on o.id = i.order_id
      where ${inRange} and ${live} group by i.name_en_snapshot order by sum(i.quantity) desc, revenue desc limit 20`),
    db.execute(sql`
      select c.name_en as name, sum(i.quantity) as quantity, sum(i.line_total_minor)::bigint as revenue
      from order_items i join orders o on o.id = i.order_id join products pr on pr.id = i.product_id join menu_categories c on c.id = pr.category_id
      where ${inRange} and ${live} group by c.name_en order by revenue desc`),
    db.execute(sql`
      select
        count(r.at) as prep_orders, round(avg(extract(epoch from r.at - o.created_at))) as avg_prep,
        count(d.at) as completed_orders, round(avg(extract(epoch from d.at - o.created_at))) as avg_completion
      from orders o
      left join lateral (select min(e.created_at) as at from order_events e where e.order_id = o.id and e.type = 'KITCHEN_STATUS' and e.to_status = 'READY') r on true
      left join lateral (select min(e.created_at) as at from order_events e where e.order_id = o.id and e.type = 'DELIVERED') d on true
      where ${inRange} and ${live}`),
    db.execute(sql`
      select c.name, count(*) as assigned,
        count(d.at) as delivered,
        round(avg(extract(epoch from d.at - a.created_at))) as avg_delivery
      from captain_assignments a
      join captains c on c.id = a.captain_id
      join orders o on o.id = a.order_id
      left join lateral (select min(e.created_at) as at from order_events e where e.order_id = o.id and e.type = 'DELIVERED' and a.unassigned_at is null) d on true
      where ${inRange} and a.unassigned_at is null
      group by c.name order by assigned desc`),
    db.execute(sql`
      select c.name, count(*) as orders, count(r.at) as ready, round(avg(extract(epoch from r.at - o.created_at))) as avg_prep
      from orders o
      join chefs c on c.id = o.chef_id
      left join lateral (select min(e.created_at) as at from order_events e where e.order_id = o.id and e.type = 'KITCHEN_STATUS' and e.to_status = 'READY') r on true
      where ${inRange} and ${live}
      group by c.id, c.name order by count(*) desc, c.name`),
    db.execute(sql`
      select o.order_ref, o.table_number_snapshot as table_number, o.cancel_reason as reason, o.total_minor as total, o.created_at
      from orders o where ${inRange} and o.kitchen_status = 'CANCELLED' order by o.created_at desc limit 200`),
  ]);

  const t = timing[0] ?? {};
  const seconds = (v: unknown) => (v === null || v === undefined ? null : int(v));
  return {
    currency,
    timezone,
    range: { from, to },
    clamped,
    full,
    totals: totalsOf(totals[0] ?? {}),
    daily: daily.map((r) => ({ date: String(r.date), ...totalsOf(r) })),
    byTable: byTable.map((r) => ({ tableNumber: int(r.table_number), orders: int(r.orders), totalMinor: int(r.total) })),
    byStatus: byStatus.map((r) => ({ status: String(r.status), orders: int(r.orders) })),
    byPaymentMethod: byMethod.map((r) => ({
      method: String(r.method),
      paymentsMinor: int(r.payments),
      refundsMinor: int(r.refunds),
      netMinor: int(r.payments) - int(r.refunds),
      count: int(r.count),
    })),
    topProducts: topProducts.map((r) => ({ name: String(r.name), quantity: int(r.quantity), revenueMinor: int(r.revenue) })),
    categories: categories.map((r) => ({ name: String(r.name), quantity: int(r.quantity), revenueMinor: int(r.revenue) })),
    timing: {
      prepOrders: int(t.prep_orders),
      avgPrepSeconds: seconds(t.avg_prep),
      completedOrders: int(t.completed_orders),
      avgCompletionSeconds: seconds(t.avg_completion),
    },
    captains: captains.map((r) => ({ name: String(r.name), assigned: int(r.assigned), delivered: int(r.delivered), avgDeliverySeconds: seconds(r.avg_delivery) })),
    chefs: chefRows.map((r) => ({ name: String(r.name), orders: int(r.orders), ready: int(r.ready), avgPrepSeconds: seconds(r.avg_prep) })),
    cancelled: cancelled.map((r) => ({
      orderRef: String(r.order_ref),
      tableNumber: int(r.table_number),
      reason: r.reason === null ? null : String(r.reason),
      totalMinor: int(r.total),
      createdAt: new Date(String(r.created_at)),
    })),
  };
}

export const REPORT_SECTIONS = ["daily", "tables", "status", "payment-methods", "products", "categories", "captains", "chefs", "cancelled"] as const;
export type ReportSection = (typeof REPORT_SECTIONS)[number];

/** CSV for one report section. Money columns are plain decimals in the branch currency. */
export function reportCsv(report: Report, section: ReportSection, money: (minor: number) => string): string {
  const rows: (string | number)[][] = (() => {
    switch (section) {
      case "daily":
        return [
          ["date", "orders", "cancelled", "gross", "discounts", "tax", "service", "order_total", "payments", "refunds", "net_recorded_sales", "outstanding"],
          ...report.daily.map((d) => [d.date, d.orders, d.cancelled, money(d.grossMinor), money(d.discountMinor), money(d.taxMinor), money(d.serviceMinor), money(d.totalMinor), money(d.paymentsMinor), money(d.refundsMinor), money(d.netMinor), money(d.outstandingMinor)]),
        ];
      case "tables":
        return [["table", "orders", "order_total"], ...report.byTable.map((r) => [r.tableNumber, r.orders, money(r.totalMinor)])];
      case "status":
        return [["kitchen_status", "orders"], ...report.byStatus.map((r) => [r.status, r.orders])];
      case "payment-methods":
        return [["method", "payments_count", "payments", "refunds", "net"], ...report.byPaymentMethod.map((r) => [r.method, r.count, money(r.paymentsMinor), money(r.refundsMinor), money(r.netMinor)])];
      case "products":
        return [["product", "quantity", "revenue"], ...report.topProducts.map((r) => [r.name, r.quantity, money(r.revenueMinor)])];
      case "categories":
        return [["category", "quantity", "revenue"], ...report.categories.map((r) => [r.name, r.quantity, money(r.revenueMinor)])];
      case "captains":
        return [["captain", "assigned", "delivered", "avg_delivery_seconds"], ...report.captains.map((r) => [r.name, r.assigned, r.delivered, r.avgDeliverySeconds ?? ""])];
      case "chefs":
        return [["chef", "orders", "ready", "avg_prep_seconds"], ...report.chefs.map((r) => [r.name, r.orders, r.ready, r.avgPrepSeconds ?? ""])];
      case "cancelled":
        return [["order_ref", "table", "reason", "order_total", "created_at"], ...report.cancelled.map((r) => [r.orderRef, r.tableNumber, r.reason ?? "", money(r.totalMinor), r.createdAt.toISOString()])];
    }
  })();
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** Quotes a CSV cell and neutralises spreadsheet formulas (CSV injection). */
export function csvCell(value: string | number): string {
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) || text !== String(value) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Live counts for the admin overview: what needs attention right now. */
export async function getLiveCounts(staff: StaffUser): Promise<{ activeOrders: number; openTables: number; pendingAssistance: number; unpaidMinor: number }> {
  const { branchId } = access(staff);
  const [row] = await db.execute(sql`
    select
      (select count(*) from orders where branch_id = ${branchId} and kitchen_status in ('NEW', 'ACCEPTED', 'IN_PREPARATION', 'READY')) as active_orders,
      (select count(*) from table_sessions where branch_id = ${branchId} and status <> 'CLOSED') as open_tables,
      (select count(*) from assistance_requests where branch_id = ${branchId} and status = 'PENDING') as pending_assistance,
      (select coalesce(sum(o.total_minor - o.paid_minor), 0)::bigint from orders o join table_sessions s on s.id = o.session_id
        where o.branch_id = ${branchId} and s.status <> 'CLOSED' and o.kitchen_status <> 'CANCELLED' and o.total_minor > o.paid_minor) as unpaid`);
  return { activeOrders: int(row.active_orders), openTables: int(row.open_tables), pendingAssistance: int(row.pending_assistance), unpaidMinor: int(row.unpaid) };
}
