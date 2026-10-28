"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import type { FormResult } from "@/app/_components/use-kept-form";
import { AuthError, authorize } from "@/server/auth/session";
import { createCaptain, updateCaptain } from "@/server/operations/captains";
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

export async function createCaptainAction(_prev: FormResult, form: FormData): Promise<FormResult> {
  try {
    await createCaptain(await authorize("captains.manage"), { ...fields(form), isActive: true });
  } catch (e) {
    return { error: toMessage(e) };
  }
  revalidatePath("/admin/captains");
  return { ok: "Captain added." };
}

export async function updateCaptainAction(id: string, _prev: FormResult, form: FormData): Promise<FormResult> {
  try {
    await updateCaptain(await authorize("captains.manage"), id, fields(form));
  } catch (e) {
    return { error: toMessage(e) };
  }
  revalidatePath("/admin/captains");
  return { ok: "Saved." };
}
