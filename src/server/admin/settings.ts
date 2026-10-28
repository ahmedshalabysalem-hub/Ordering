import { and, asc, eq, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { writeAudit } from "@/server/audit";
import { branchFor, type StaffUser } from "@/server/auth/permissions";
import { db } from "@/server/db/client";
import { branches, branchSettings, orders, paymentMethods, products, restaurants, taxRates } from "@/server/db/schema";
import { saveImage } from "@/server/media/storage";
import { currencyDigits } from "@/server/money";

// Restaurant settings (ADM-002, SPEC §4.1, ADR-006, ADR-017). Every change is audited with before and
// after values. Percentages are typed as decimal text and become basis points without floats.

export class SettingsError extends Error {}

/** "14", "14.5" or "14.25" (percent) → basis points (1400, 1450, 1425). */
export function percentToBps(text: string): number {
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!match) throw new SettingsError("Enter a percentage like 14 or 12.5.");
  const bps = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  if (bps > 10000) throw new SettingsError("A percentage cannot be more than 100.");
  return bps;
}

/** Basis points → percent text, the inverse of percentToBps. */
export const bpsToPercent = (bps: number) => (bps % 100 === 0 ? String(bps / 100) : `${Math.floor(bps / 100)}.${String(bps % 100).padStart(2, "0").replace(/0$/, "")}`);

const isTimeZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

const isCurrency = (code: string) => {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: code }).resolvedOptions().currency === code;
  } catch {
    return false;
  }
};

export const settingsInput = z
  .object({
    restaurantNameAr: z.string().trim().min(1, "Enter the Arabic name.").max(100),
    restaurantNameEn: z.string().trim().min(1, "Enter the English name.").max(100),
    timezone: z.string().trim().refine(isTimeZone, "Choose a valid time zone, like Africa/Cairo."),
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .refine((c) => /^[A-Z]{3}$/.test(c) && isCurrency(c), "Enter a three-letter currency code, like EGP."),
    defaultLanguage: z.enum(["ar", "en"]),
    fallbackLanguage: z.enum(["ar", "en"]),
    taxPercent: z.string(),
    pricesIncludeTax: z.boolean(),
    servicePercent: z.string(),
    prepWarnMinutes: z.coerce.number().int().min(1).max(240),
    prepOverdueMinutes: z.coerce.number().int().min(1).max(480),
    sessionClosePolicy: z.enum(["ALL_PAID_AND_DELIVERED", "ALL_PAID"]),
    assistanceCooldownSeconds: z.coerce.number().int().min(0).max(3600),
    newOrderSound: z.boolean(),
  })
  .refine((s) => s.prepOverdueMinutes >= s.prepWarnMinutes, { message: "The overdue time must not be shorter than the warning time.", path: ["prepOverdueMinutes"] });

export type SettingsView = {
  restaurantNameAr: string;
  restaurantNameEn: string;
  logoUrl: string | null;
  timezone: string;
  currency: string;
  defaultLanguage: "ar" | "en";
  fallbackLanguage: "ar" | "en";
  taxPercent: string;
  pricesIncludeTax: boolean;
  servicePercent: string;
  prepWarnMinutes: number;
  prepOverdueMinutes: number;
  sessionClosePolicy: "ALL_PAID_AND_DELIVERED" | "ALL_PAID";
  assistanceCooldownSeconds: number;
  newOrderSound: boolean;
  hasOrders: boolean;
  paymentMethods: { id: string; code: string; nameAr: string; nameEn: string; isActive: boolean }[];
};

export async function getSettings(staff: StaffUser): Promise<SettingsView> {
  const branchId = branchFor(staff, "settings.manage");
  const [[row], taxes, methods, [ordersCount]] = await Promise.all([
    db
      .select({ branch: branches, settings: branchSettings, restaurant: restaurants })
      .from(branches)
      .innerJoin(restaurants, eq(restaurants.id, branches.restaurantId))
      .leftJoin(branchSettings, eq(branchSettings.branchId, branches.id))
      .where(eq(branches.id, branchId)),
    db
      .select({ rateBps: taxRates.rateBps })
      .from(taxRates)
      .where(and(eq(taxRates.branchId, branchId), eq(taxRates.isActive, true))),
    db.select().from(paymentMethods).where(eq(paymentMethods.branchId, branchId)).orderBy(asc(paymentMethods.createdAt)),
    db.select({ n: sql<number>`count(*)::int` }).from(orders).where(eq(orders.branchId, branchId)),
  ]);
  const s = row.settings;
  return {
    restaurantNameAr: row.restaurant.nameAr,
    restaurantNameEn: row.restaurant.nameEn,
    logoUrl: row.restaurant.logoUrl,
    timezone: row.branch.timezone,
    currency: row.branch.currency,
    defaultLanguage: row.branch.defaultLanguage === "en" ? "en" : "ar",
    fallbackLanguage: s?.fallbackLanguage === "en" ? "en" : "ar",
    taxPercent: bpsToPercent(taxes.reduce((sum, t) => sum + t.rateBps, 0)),
    pricesIncludeTax: s?.pricesIncludeTax ?? false,
    servicePercent: bpsToPercent(s?.serviceChargeBps ?? 0),
    prepWarnMinutes: s?.prepWarnMinutes ?? 10,
    prepOverdueMinutes: s?.prepOverdueMinutes ?? 20,
    sessionClosePolicy: s?.sessionClosePolicy === "ALL_PAID" ? "ALL_PAID" : "ALL_PAID_AND_DELIVERED",
    assistanceCooldownSeconds: s?.assistanceCooldownSeconds ?? 60,
    newOrderSound: s?.newOrderSound ?? true,
    hasOrders: ordersCount.n > 0,
    paymentMethods: methods.map((m) => ({ id: m.id, code: m.code, nameAr: m.nameAr, nameEn: m.nameEn, isActive: m.isActive })),
  };
}

export async function updateSettings(staff: StaffUser, raw: z.input<typeof settingsInput>, logo: { upload?: Uint8Array; remove?: boolean } = {}): Promise<void> {
  const branchId = branchFor(staff, "settings.manage");
  const input = settingsInput.parse(raw);
  const taxBps = percentToBps(input.taxPercent || "0");
  const serviceBps = percentToBps(input.servicePercent || "0");
  const before = await getSettings(staff);
  if (input.currency !== before.currency) {
    // Prices are stored in minor units of the branch currency (ADR-011): changing it later would
    // silently change every price and every past receipt.
    if (before.hasOrders) throw new SettingsError("The currency cannot change once orders exist.");
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(products).where(eq(products.branchId, branchId));
    if (n > 0 && currencyDigits(input.currency) !== currencyDigits(before.currency)) {
      throw new SettingsError(`${input.currency} uses a different number of decimals than ${before.currency}; re-enter the menu prices after changing it.`);
    }
  }
  const logoUrl = logo.upload ? await saveImage(logo.upload) : logo.remove ? null : before.logoUrl;

  await db.transaction(async (tx) => {
    const [branch] = await tx.select({ restaurantId: branches.restaurantId }).from(branches).where(eq(branches.id, branchId)).for("update");
    await tx.update(restaurants).set({ nameAr: input.restaurantNameAr, nameEn: input.restaurantNameEn, logoUrl }).where(eq(restaurants.id, branch.restaurantId));
    await tx.update(branches).set({ timezone: input.timezone, currency: input.currency, defaultLanguage: input.defaultLanguage }).where(eq(branches.id, branchId));
    const settings = {
      pricesIncludeTax: input.pricesIncludeTax,
      serviceChargeBps: serviceBps,
      prepWarnMinutes: input.prepWarnMinutes,
      prepOverdueMinutes: input.prepOverdueMinutes,
      sessionClosePolicy: input.sessionClosePolicy,
      assistanceCooldownSeconds: input.assistanceCooldownSeconds,
      newOrderSound: input.newOrderSound,
      fallbackLanguage: input.fallbackLanguage,
    };
    await tx.insert(branchSettings).values({ branchId, ...settings }).onConflictDoUpdate({ target: branchSettings.branchId, set: settings });

    // One tax rate per branch in the MVP: keep the first active rate, switch any others off.
    const rates = await tx.select().from(taxRates).where(eq(taxRates.branchId, branchId)).orderBy(asc(taxRates.createdAt));
    const keep = rates.find((r) => r.isActive) ?? rates[0];
    if (keep) await tx.update(taxRates).set({ rateBps: taxBps, isActive: taxBps > 0 }).where(eq(taxRates.id, keep.id));
    else if (taxBps > 0) await tx.insert(taxRates).values({ id: uuidv7(), branchId, name: "VAT", rateBps: taxBps });
    for (const r of rates) if (r.id !== keep?.id && r.isActive) await tx.update(taxRates).set({ isActive: false }).where(eq(taxRates.id, r.id));

    const { paymentMethods: _m, hasOrders: _h, ...beforeValues } = before;
    void _m;
    void _h;
    await writeAudit(tx, {
      branchId,
      actorUserId: staff.id,
      action: "SETTINGS_UPDATED",
      entityType: "branch",
      entityId: branchId,
      before: beforeValues,
      after: { ...input, taxPercent: bpsToPercent(taxBps), servicePercent: bpsToPercent(serviceBps), logoUrl },
    });
  });
}

export const paymentMethodInput = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_]{2,20}$/, "Use 2 to 20 letters, digits or _ for the code."),
  nameAr: z.string().trim().min(1, "Enter the Arabic name.").max(50),
  nameEn: z.string().trim().min(1, "Enter the English name.").max(50),
});

export async function addPaymentMethod(staff: StaffUser, raw: z.input<typeof paymentMethodInput>): Promise<void> {
  const branchId = branchFor(staff, "settings.manage");
  const input = paymentMethodInput.parse(raw);
  await db.transaction(async (tx) => {
    const [taken] = await tx.select({ id: paymentMethods.id }).from(paymentMethods).where(and(eq(paymentMethods.branchId, branchId), eq(paymentMethods.code, input.code)));
    if (taken) throw new SettingsError(`The code ${input.code} is already used.`);
    const id = uuidv7();
    await tx.insert(paymentMethods).values({ id, branchId, ...input });
    await writeAudit(tx, { branchId, actorUserId: staff.id, action: "PAYMENT_METHOD_ADDED", entityType: "payment_method", entityId: id, after: input });
  });
}

export async function setPaymentMethodActive(staff: StaffUser, id: string, isActive: boolean): Promise<void> {
  const branchId = branchFor(staff, "settings.manage");
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(paymentMethods)
      .set({ isActive })
      .where(and(eq(paymentMethods.id, id), eq(paymentMethods.branchId, branchId)))
      .returning();
    if (!row) throw new SettingsError("Payment method not found.");
    await writeAudit(tx, { branchId, actorUserId: staff.id, action: isActive ? "PAYMENT_METHOD_ENABLED" : "PAYMENT_METHOD_DISABLED", entityType: "payment_method", entityId: id, after: { isActive } });
  });
}
