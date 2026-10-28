"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import type { FormResult } from "@/app/_components/use-kept-form";
import { createUser, resetPassword, updateUser, UserAdminError } from "@/server/admin/users";
import { AuthError, authorize } from "@/server/auth/session";

function toMessage(e: unknown): string {
  if (e instanceof AuthError || e instanceof UserAdminError) return e.message;
  if (e instanceof ZodError) return e.issues[0]?.message ?? "Check the form.";
  throw e;
}

export async function createUserAction(_prev: FormResult, form: FormData): Promise<FormResult> {
  try {
    await createUser(await authorize("users.manage"), {
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      role: String(form.get("role") ?? "") as "CASHIER",
      password: String(form.get("password") ?? ""),
    });
  } catch (e) {
    return { error: toMessage(e) };
  }
  revalidatePath("/admin/users");
  return { ok: "User created. Give them the password in person; they can sign in now." };
}

export async function updateUserAction(id: string, _prev: FormResult, form: FormData): Promise<FormResult> {
  try {
    await updateUser(await authorize("users.manage"), id, {
      name: String(form.get("name") ?? ""),
      role: String(form.get("role") ?? "") as "CASHIER",
      isActive: form.get("isActive") !== null,
    });
  } catch (e) {
    return { error: toMessage(e) };
  }
  revalidatePath("/admin/users");
  return { ok: "Saved." };
}

export async function resetPasswordAction(id: string, _prev: FormResult, form: FormData): Promise<FormResult> {
  try {
    await resetPassword(await authorize("users.manage"), id, String(form.get("password") ?? ""));
  } catch (e) {
    return { error: toMessage(e) };
  }
  return { ok: "Password changed. The user was signed out everywhere." };
}
