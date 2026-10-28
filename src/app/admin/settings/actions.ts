"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import type { FormResult } from "@/app/_components/use-kept-form";
import { addPaymentMethod, setPaymentMethodActive, SettingsError, updateSettings } from "@/server/admin/settings";
import { AuthError, authorize } from "@/server/auth/session";
import { ImageError } from "@/server/media/images";

function toMessage(e: unknown): string {
  if (e instanceof AuthError || e instanceof SettingsError || e instanceof ImageError) return e.message;
  if (e instanceof ZodError) return e.issues[0]?.message ?? "Check the form.";
  throw e;
}

const text = (form: FormData, key: string) => String(form.get(key) ?? "");

export async function updateSettingsAction(_prev: FormResult, form: FormData): Promise<FormResult> {
  try {
    const file = form.get("logo");
    const upload = file instanceof File && file.size > 0 ? new Uint8Array(await file.arrayBuffer()) : undefined;
    await updateSettings(
      await authorize("settings.manage"),
      {
        restaurantNameAr: text(form, "restaurantNameAr"),
        restaurantNameEn: text(form, "restaurantNameEn"),
        timezone: text(form, "timezone"),
        currency: text(form, "currency"),
        defaultLanguage: text(form, "defaultLanguage") as "ar",
        fallbackLanguage: text(form, "fallbackLanguage") as "ar",
        taxPercent: text(form, "taxPercent"),
        pricesIncludeTax: form.get("pricesIncludeTax") !== null,
        servicePercent: text(form, "servicePercent"),
        prepWarnMinutes: text(form, "prepWarnMinutes"),
        prepOverdueMinutes: text(form, "prepOverdueMinutes"),
        sessionClosePolicy: text(form, "sessionClosePolicy") as "ALL_PAID",
        assistanceCooldownSeconds: text(form, "assistanceCooldownSeconds"),
        newOrderSound: form.get("newOrderSound") !== null,
      },
      { upload, remove: form.get("removeLogo") !== null },
    );
  } catch (e) {
    return { error: toMessage(e) };
  }
  revalidatePath("/admin/settings");
  return { ok: "Settings saved. New orders use them from now on; past orders keep their own totals." };
}

export async function addPaymentMethodAction(_prev: FormResult, form: FormData): Promise<FormResult> {
  try {
    await addPaymentMethod(await authorize("settings.manage"), { code: text(form, "code"), nameAr: text(form, "nameAr"), nameEn: text(form, "nameEn") });
  } catch (e) {
    return { error: toMessage(e) };
  }
  revalidatePath("/admin/settings");
  return { ok: "Payment method added." };
}

export async function togglePaymentMethodAction(id: string, isActive: boolean): Promise<void> {
  await setPaymentMethodActive(await authorize("settings.manage"), id, isActive);
  revalidatePath("/admin/settings");
}
