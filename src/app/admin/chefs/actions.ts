"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import type { FormResult } from "@/app/_components/use-kept-form";
import { AuthError, authorize } from "@/server/auth/session";
import { createChef, updateChef } from "@/server/operations/chefs";
import { OperationError } from "@/server/operations/orders";

function toMessage(e: unknown): string {
  if (e instanceof AuthError || e instanceof OperationError) return e.message;
  if (e instanceof ZodError) return e.issues[0]?.message ?? "Check the form.";
  throw e;
}

const fields = (form: FormData) => ({
  name: String(form.get("name") ?? ""),
  phone: String(form.get("phone") ?? ""),
  isActive: form.get("isActive") !== null,
});

export async function createChefAction(_prev: FormResult, form: FormData): Promise<FormResult> {
  try {
    await createChef(await authorize("chefs.manage"), { ...fields(form), isActive: true });
  } catch (e) {
    return { error: toMessage(e) };
  }
  revalidatePath("/admin/chefs");
  return { ok: "Chef added." };
}

export async function updateChefAction(id: string, _prev: FormResult, form: FormData): Promise<FormResult> {
  try {
    await updateChef(await authorize("chefs.manage"), id, fields(form));
  } catch (e) {
    return { error: toMessage(e) };
  }
  revalidatePath("/admin/chefs");
  return { ok: "Saved." };
}
