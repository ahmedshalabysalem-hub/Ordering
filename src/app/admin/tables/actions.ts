"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { AuthError, authorize } from "@/server/auth/session";
import { createTable, regenerateQrToken, TableError, updateTable } from "@/server/tables/service";

export type FormState = { error?: string; ok?: string };

function formInput(formData: FormData) {
  return {
    number: formData.get("number") as string,
    name: (formData.get("name") as string) ?? undefined,
    section: (formData.get("section") as string) ?? undefined,
    isActive: formData.get("isActive") === "on",
  };
}

function toMessage(e: unknown): string {
  if (e instanceof TableError || e instanceof AuthError) return e.message;
  if (e instanceof ZodError) return "Check the form: table number must be a whole number from 1 to 9999.";
  throw e;
}

export async function createTableAction(_prev: FormState, formData: FormData): Promise<FormState> {
  let id: string;
  try {
    const staff = await authorize("tables.manage");
    id = (await createTable(staff, formInput(formData))).id;
  } catch (e) {
    return { error: toMessage(e) };
  }
  revalidatePath("/admin/tables");
  redirect(`/admin/tables/${id}`);
}

export async function updateTableAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const staff = await authorize("tables.manage");
    await updateTable(staff, id, formInput(formData));
  } catch (e) {
    return { error: toMessage(e) };
  }
  revalidatePath("/admin/tables");
  revalidatePath(`/admin/tables/${id}`);
  return { ok: "Saved." };
}

export async function regenerateQrAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  if (formData.get("confirm") !== "REGENERATE") return { error: 'Type REGENERATE to confirm.' };
  try {
    const staff = await authorize("qr.regenerate");
    await regenerateQrToken(staff, id, (formData.get("reason") as string) ?? "");
  } catch (e) {
    if (e instanceof ZodError) return { error: "Give a reason (at least 3 characters)." };
    return { error: toMessage(e) };
  }
  revalidatePath(`/admin/tables/${id}`);
  return { ok: "New QR code issued. Print and replace the old card; it no longer works." };
}
