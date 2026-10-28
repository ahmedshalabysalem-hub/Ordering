"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import type { FormResult } from "@/app/_components/use-kept-form";
import { createSupplier, SupplierError, updateSupplier } from "@/server/admin/suppliers";
import { AuthError, authorize } from "@/server/auth/session";

function toMessage(e: unknown): string {
  if (e instanceof AuthError || e instanceof SupplierError) return e.message;
  if (e instanceof ZodError) return e.issues[0]?.message ?? "Check the form.";
  throw e;
}

const fields = (form: FormData) => ({
  name: String(form.get("name") ?? ""),
  contactPerson: String(form.get("contactPerson") ?? ""),
  phone: String(form.get("phone") ?? ""),
  email: String(form.get("email") ?? ""),
  address: String(form.get("address") ?? ""),
  taxNumber: String(form.get("taxNumber") ?? ""),
  notes: String(form.get("notes") ?? ""),
  isActive: form.get("isActive") !== null,
});

export async function createSupplierAction(_prev: FormResult, form: FormData): Promise<FormResult> {
  try {
    await createSupplier(await authorize("suppliers.manage"), { ...fields(form), isActive: true });
  } catch (e) {
    return { error: toMessage(e) };
  }
  revalidatePath("/admin/suppliers");
  return { ok: "Supplier added." };
}

export async function updateSupplierAction(id: string, _prev: FormResult, form: FormData): Promise<FormResult> {
  try {
    await updateSupplier(await authorize("suppliers.manage"), id, fields(form));
  } catch (e) {
    return { error: toMessage(e) };
  }
  revalidatePath("/admin/suppliers");
  return { ok: "Saved." };
}
