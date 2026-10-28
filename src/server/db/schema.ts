// Drizzle table definitions. Source of truth for the design: docs/architecture/DATA_MODEL.md (ADR-007).
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";

// ---------- shared column helpers ----------

const id = () =>
  uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7());
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const ts = (name: string) => timestamp(name, { withTimezone: true });
const money = (name: string) => bigint(name, { mode: "number" });

const inList = (column: string, values: readonly string[]) =>
  sql.raw(`${column} in (${values.map((v) => `'${v}'`).join(", ")})`);

// ---------- status values ----------

export const ROLES = ["ADMIN", "CASHIER", "KITCHEN", "CAPTAIN"] as const;
export const LANGUAGES = ["ar", "en"] as const;
export const SESSION_STATUSES = ["OPEN", "CLOSING", "CLOSED"] as const;
export const KITCHEN_STATUSES = ["NEW", "ACCEPTED", "IN_PREPARATION", "READY", "CANCELLED"] as const;
export const DELIVERY_STATUSES = ["NOT_ASSIGNED", "ASSIGNED", "ACCEPTED", "DELIVERED"] as const;
export const PAYMENT_STATUSES = ["UNPAID", "PARTIALLY_PAID", "PAID", "REFUNDED", "PARTIALLY_REFUNDED"] as const;
export const PAYMENT_KINDS = ["PAYMENT", "REFUND"] as const;
export const ASSISTANCE_STATUSES = ["PENDING", "ACKNOWLEDGED", "RESOLVED", "CANCELLED"] as const;
export const SESSION_CLOSE_POLICIES = ["ALL_PAID_AND_DELIVERED", "ALL_PAID"] as const;

// ---------- organization and settings ----------

export const restaurants = pgTable("restaurants", {
  id: id(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
  logoUrl: text("logo_url"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const branches = pgTable(
  "branches",
  {
    id: id(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id),
    nameAr: text("name_ar").notNull(),
    nameEn: text("name_en").notNull(),
    timezone: text("timezone").notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    defaultLanguage: text("default_language").notNull().default("ar"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("branches_currency_upper", sql`${t.currency} ~ '^[A-Z]{3}$'`),
    check("branches_default_language", inList("default_language", LANGUAGES)),
  ],
);

export const branchSettings = pgTable(
  "branch_settings",
  {
    branchId: uuid("branch_id")
      .primaryKey()
      .references(() => branches.id),
    pricesIncludeTax: boolean("prices_include_tax").notNull().default(false),
    serviceChargeBps: integer("service_charge_bps").notNull().default(0),
    newOrderSound: boolean("new_order_sound").notNull().default(true),
    prepWarnMinutes: integer("prep_warn_minutes").notNull().default(10),
    prepOverdueMinutes: integer("prep_overdue_minutes").notNull().default(20),
    sessionClosePolicy: text("session_close_policy").notNull().default("ALL_PAID_AND_DELIVERED"),
    assistanceCooldownSeconds: integer("assistance_cooldown_seconds").notNull().default(60),
    fallbackLanguage: text("fallback_language").notNull().default("ar"),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("branch_settings_service_charge", sql`${t.serviceChargeBps} between 0 and 10000`),
    check("branch_settings_prep_minutes", sql`${t.prepWarnMinutes} > 0 and ${t.prepOverdueMinutes} >= ${t.prepWarnMinutes}`),
    check("branch_settings_cooldown", sql`${t.assistanceCooldownSeconds} >= 0`),
    check("branch_settings_close_policy", inList("session_close_policy", SESSION_CLOSE_POLICIES)),
    check("branch_settings_fallback_language", inList("fallback_language", LANGUAGES)),
  ],
);

export const taxRates = pgTable(
  "tax_rates",
  {
    id: id(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    name: text("name").notNull(),
    rateBps: integer("rate_bps").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check("tax_rates_rate", sql`${t.rateBps} between 0 and 10000`), index("tax_rates_branch_idx").on(t.branchId)],
);

export const paymentMethods = pgTable(
  "payment_methods",
  {
    id: id(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    code: text("code").notNull(),
    nameAr: text("name_ar").notNull(),
    nameEn: text("name_en").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("payment_methods_branch_code_uq").on(t.branchId, t.code)],
);

// ---------- users and access ----------
export const users = pgTable(
  "users",
  {
    id: id(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    isActive: boolean("is_active").notNull().default(true),
    lastLoginAt: ts("last_login_at"),
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    lockedUntil: ts("locked_until"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("users_email_lower_uq").on(sql`lower(${t.email})`)],
);

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    role: text("role").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.branchId, t.role] }), check("user_roles_role", inList("role", ROLES))],
);

// Auth library tables (ADR-009). Property names follow Better Auth's field names.

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    expiresAt: ts("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("auth_sessions_token_uq").on(t.token), index("auth_sessions_user_idx").on(t.userId)],
);

export const authAccounts = pgTable(
  "auth_accounts",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    // Password hash for providerId = 'credential'. Never selected outside the auth layer.
    password: text("password"),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: ts("access_token_expires_at"),
    refreshTokenExpiresAt: ts("refresh_token_expires_at"),
    scope: text("scope"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("auth_accounts_provider_account_uq").on(t.providerId, t.accountId),
    index("auth_accounts_user_idx").on(t.userId),
  ],
);

export const authVerifications = pgTable(
  "auth_verifications",
  {
    id: id(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: ts("expires_at").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("auth_verifications_identifier_idx").on(t.identifier)],
);

// ---------- tables and QR (ADR-004) ----------

export const diningTables = pgTable(
  "dining_tables",
  {
    id: id(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    number: integer("number").notNull(),
    name: text("name"),
    section: text("section"),
    isActive: boolean("is_active").notNull().default(true),
    // Permanent public identifier. Changed only by an explicit admin regenerate action.
    qrToken: text("qr_token").notNull(),
    qrTokenRotatedAt: ts("qr_token_rotated_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("dining_tables_branch_number_uq").on(t.branchId, t.number),
    uniqueIndex("dining_tables_qr_token_uq").on(t.qrToken),
    check("dining_tables_number_positive", sql`${t.number} > 0`),
  ],
);

// ---------- menu ----------

export const menuCategories = pgTable(
  "menu_categories",
  {
    id: id(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    nameAr: text("name_ar").notNull(),
    nameEn: text("name_en").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("menu_categories_branch_idx").on(t.branchId, t.sortOrder)],
);

export const products = pgTable(
  "products",
  {
    id: id(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => menuCategories.id),
    nameAr: text("name_ar").notNull(),
    nameEn: text("name_en").notNull(),
    descriptionAr: text("description_ar"),
    descriptionEn: text("description_en"),
    imageUrl: text("image_url"),
    priceMinor: money("price_minor").notNull(),
    sku: text("sku"),
    isAvailable: boolean("is_available").notNull().default(true),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    prepStation: text("prep_station"),
    prepMinutes: integer("prep_minutes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("products_price_non_negative", sql`${t.priceMinor} >= 0`),
    check("products_prep_minutes", sql`${t.prepMinutes} is null or ${t.prepMinutes} > 0`),
    index("products_category_idx").on(t.categoryId, t.sortOrder),
    uniqueIndex("products_branch_sku_uq").on(t.branchId, t.sku).where(sql`${t.sku} is not null`),
  ],
);

export const modifierGroups = pgTable(
  "modifier_groups",
  {
    id: id(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    nameAr: text("name_ar").notNull(),
    nameEn: text("name_en").notNull(),
    minSelect: integer("min_select").notNull().default(0),
    maxSelect: integer("max_select").notNull().default(1),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check("modifier_groups_select_range", sql`${t.minSelect} >= 0 and ${t.maxSelect} >= greatest(${t.minSelect}, 1)`)],
);

export const modifierOptions = pgTable(
  "modifier_options",
  {
    id: id(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => modifierGroups.id),
    nameAr: text("name_ar").notNull(),
    nameEn: text("name_en").notNull(),
    priceDeltaMinor: money("price_delta_minor").notNull().default(0),
    isAvailable: boolean("is_available").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("modifier_options_price_non_negative", sql`${t.priceDeltaMinor} >= 0`),
    index("modifier_options_group_idx").on(t.groupId, t.sortOrder),
  ],
);

export const productModifierGroups = pgTable(
  "product_modifier_groups",
  {
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    groupId: uuid("group_id")
      .notNull()
      .references(() => modifierGroups.id),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.productId, t.groupId] })],
);

// ---------- table sessions and orders ----------

export const tableSessions = pgTable(
  "table_sessions",
  {
    id: id(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    tableId: uuid("table_id")
      .notNull()
      .references(() => diningTables.id),
    status: text("status").notNull().default("OPEN"),
    openedAt: createdAt(),
    closingStartedAt: ts("closing_started_at"),
    closedAt: ts("closed_at"),
    closedBy: uuid("closed_by").references(() => users.id),
    version: integer("version").notNull().default(1),
  },
  (t) => [
    check("table_sessions_status", inList("status", SESSION_STATUSES)),
    check("table_sessions_closed_fields", sql`(${t.status} = 'CLOSED') = (${t.closedAt} is not null)`),
    // At most one non-closed session per table.
    uniqueIndex("table_sessions_one_open_per_table_uq").on(t.tableId).where(sql`${t.status} <> 'CLOSED'`),
  ],
);

export const orderCounters = pgTable(
  "order_counters",
  {
    tableId: uuid("table_id")
      .notNull()
      .references(() => diningTables.id),
    businessDate: date("business_date").notNull(),
    lastSeq: integer("last_seq").notNull(),
  },
  (t) => [primaryKey({ columns: [t.tableId, t.businessDate] }), check("order_counters_positive", sql`${t.lastSeq} > 0`)],
);

export const orders = pgTable(
  "orders",
  {
    id: id(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => tableSessions.id),
    tableId: uuid("table_id")
      .notNull()
      .references(() => diningTables.id),
    tableNumberSnapshot: integer("table_number_snapshot").notNull(),
    businessDate: date("business_date").notNull(),
    seq: integer("seq").notNull(),
    orderRef: text("order_ref").notNull(),
    trackingToken: text("tracking_token").notNull(),
    kitchenStatus: text("kitchen_status").notNull().default("NEW"),
    deliveryStatus: text("delivery_status").notNull().default("NOT_ASSIGNED"),
    paymentStatus: text("payment_status").notNull().default("UNPAID"),
    currency: char("currency", { length: 3 }).notNull(),
    subtotalMinor: money("subtotal_minor").notNull(),
    discountMinor: money("discount_minor").notNull().default(0),
    taxMinor: money("tax_minor").notNull().default(0),
    serviceMinor: money("service_minor").notNull().default(0),
    totalMinor: money("total_minor").notNull(),
    paidMinor: money("paid_minor").notNull().default(0),
    customerNote: text("customer_note"),
    cancelReason: text("cancel_reason"),
    // Chef responsible in the kitchen (ADR-018). Required by the service before an order leaves NEW;
    // nullable because orders placed before ADR-018 have none.
    chefId: uuid("chef_id").references(() => chefs.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    version: integer("version").notNull().default(1),
  },
  (t) => [
    // order_ref is a per-branch daily label (ADR-012); tracking uses tracking_token, never the ref.
    uniqueIndex("orders_branch_order_ref_uq").on(t.branchId, t.orderRef),
    uniqueIndex("orders_tracking_token_uq").on(t.trackingToken),
    uniqueIndex("orders_table_date_seq_uq").on(t.tableId, t.businessDate, t.seq),
    check("orders_kitchen_status", inList("kitchen_status", KITCHEN_STATUSES)),
    check("orders_delivery_status", inList("delivery_status", DELIVERY_STATUSES)),
    check("orders_payment_status", inList("payment_status", PAYMENT_STATUSES)),
    check(
      "orders_amounts_non_negative",
      sql`${t.subtotalMinor} >= 0 and ${t.discountMinor} >= 0 and ${t.taxMinor} >= 0 and ${t.serviceMinor} >= 0 and ${t.totalMinor} >= 0 and ${t.paidMinor} >= 0`,
    ),
    check(
      "orders_total_consistent",
      sql`${t.totalMinor} = ${t.subtotalMinor} - ${t.discountMinor} + ${t.taxMinor} + ${t.serviceMinor}`,
    ),
    check("orders_seq_positive", sql`${t.seq} > 0`),
    index("orders_branch_date_idx").on(t.branchId, t.businessDate),
    index("orders_session_idx").on(t.sessionId),
    index("orders_chef_idx").on(t.chefId),
    index("orders_active_kitchen_idx")
      .on(t.branchId, t.kitchenStatus)
      .where(sql`${t.kitchenStatus} in ('NEW', 'ACCEPTED', 'IN_PREPARATION', 'READY')`),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: id(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    nameArSnapshot: text("name_ar_snapshot").notNull(),
    nameEnSnapshot: text("name_en_snapshot").notNull(),
    unitPriceMinor: money("unit_price_minor").notNull(),
    quantity: integer("quantity").notNull(),
    modifiersTotalMinor: money("modifiers_total_minor").notNull().default(0),
    lineTotalMinor: money("line_total_minor").notNull(),
    note: text("note"),
  },
  (t) => [
    check("order_items_quantity_positive", sql`${t.quantity} > 0`),
    check("order_items_amounts_non_negative", sql`${t.unitPriceMinor} >= 0 and ${t.modifiersTotalMinor} >= 0`),
    check(
      "order_items_line_total",
      sql`${t.lineTotalMinor} = (${t.unitPriceMinor} + ${t.modifiersTotalMinor}) * ${t.quantity}`,
    ),
    index("order_items_order_idx").on(t.orderId),
  ],
);

export const orderItemModifiers = pgTable(
  "order_item_modifiers",
  {
    id: id(),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => orderItems.id),
    optionId: uuid("option_id")
      .notNull()
      .references(() => modifierOptions.id),
    groupNameArSnapshot: text("group_name_ar_snapshot").notNull(),
    groupNameEnSnapshot: text("group_name_en_snapshot").notNull(),
    optionNameArSnapshot: text("option_name_ar_snapshot").notNull(),
    optionNameEnSnapshot: text("option_name_en_snapshot").notNull(),
    priceDeltaMinor: money("price_delta_minor").notNull(),
  },
  (t) => [
    check("order_item_modifiers_price_non_negative", sql`${t.priceDeltaMinor} >= 0`),
    index("order_item_modifiers_item_idx").on(t.orderItemId),
  ],
);

export const orderEvents = pgTable(
  "order_events",
  {
    id: id(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    type: text("type").notNull(),
    fromStatus: text("from_status"),
    toStatus: text("to_status"),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    data: jsonb("data"),
    createdAt: createdAt(),
  },
  (t) => [index("order_events_order_idx").on(t.orderId, t.createdAt)],
);

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    scope: text("scope").notNull(),
    key: text("key").notNull(),
    requestHash: text("request_hash").notNull(),
    response: jsonb("response"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.scope, t.key] }), index("idempotency_keys_created_idx").on(t.createdAt)],
);

// ---------- captains, payments, assistance ----------

export const captains = pgTable(
  "captains",
  {
    id: id(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    name: text("name").notNull(),
    phone: text("phone"),
    userId: uuid("user_id").references(() => users.id),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("captains_branch_idx").on(t.branchId)],
);

// Chefs the kitchen picks as responsible for an order (ADR-018). No chef login; deactivated, never
// deleted, so past orders keep their chef's name.
export const chefs = pgTable(
  "chefs",
  {
    id: id(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    name: text("name").notNull(),
    phone: text("phone"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("chefs_branch_idx").on(t.branchId)],
);

export const captainAssignments = pgTable(
  "captain_assignments",
  {
    id: id(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    captainId: uuid("captain_id")
      .notNull()
      .references(() => captains.id),
    assignedBy: uuid("assigned_by")
      .notNull()
      .references(() => users.id),
    assignedAt: createdAt(),
    unassignedAt: ts("unassigned_at"),
  },
  (t) => [
    // At most one current assignment per order; history rows have unassigned_at set.
    uniqueIndex("captain_assignments_one_current_uq").on(t.orderId).where(sql`${t.unassignedAt} is null`),
    index("captain_assignments_captain_idx").on(t.captainId),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: id(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    methodId: uuid("method_id")
      .notNull()
      .references(() => paymentMethods.id),
    kind: text("kind").notNull().default("PAYMENT"),
    amountMinor: money("amount_minor").notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    reference: text("reference"),
    reason: text("reason"),
    recordedBy: uuid("recorded_by")
      .notNull()
      .references(() => users.id),
    recordedAt: createdAt(),
  },
  (t) => [
    check("payments_kind", inList("kind", PAYMENT_KINDS)),
    check("payments_amount_positive", sql`${t.amountMinor} > 0`),
    check("payments_refund_reason", sql`${t.kind} <> 'REFUND' or ${t.reason} is not null`),
    index("payments_order_idx").on(t.orderId),
  ],
);

export const assistanceRequests = pgTable(
  "assistance_requests",
  {
    id: id(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    tableId: uuid("table_id")
      .notNull()
      .references(() => diningTables.id),
    sessionId: uuid("session_id").references(() => tableSessions.id),
    status: text("status").notNull().default("PENDING"),
    createdAt: createdAt(),
    acknowledgedBy: uuid("acknowledged_by").references(() => users.id),
    acknowledgedAt: ts("acknowledged_at"),
    resolvedBy: uuid("resolved_by").references(() => users.id),
    resolvedAt: ts("resolved_at"),
  },
  (t) => [
    check("assistance_requests_status", inList("status", ASSISTANCE_STATUSES)),
    // Dedup: one pending request per table.
    uniqueIndex("assistance_requests_one_pending_uq").on(t.tableId).where(sql`${t.status} = 'PENDING'`),
    index("assistance_requests_branch_status_idx").on(t.branchId, t.status),
  ],
);

// ---------- suppliers and audit ----------

export const suppliers = pgTable(
  "suppliers",
  {
    id: id(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    name: text("name").notNull(),
    contactPerson: text("contact_person"),
    phone: text("phone"),
    email: text("email"),
    address: text("address"),
    taxNumber: text("tax_number"),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("suppliers_branch_idx").on(t.branchId)],
);

// Insert-only: a trigger in the migrations rejects UPDATE and DELETE.
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    branchId: uuid("branch_id").references(() => branches.id),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    reason: text("reason"),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_logs_entity_idx").on(t.entityType, t.entityId),
    index("audit_logs_created_idx").on(t.createdAt),
  ],
);
