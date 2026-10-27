"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isAPIError } from "better-auth/api";
import { z } from "zod";
import { auth, LOCKED_MESSAGE } from "@/server/auth/auth";

export type LoginState = { error?: string };

const credentials = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(128),
});

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = credentials.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: "Enter your email and password." };

  try {
    await auth.api.signInEmail({ body: parsed.data, headers: await headers() });
  } catch (e) {
    if (isAPIError(e) && e.message === LOCKED_MESSAGE) return { error: LOCKED_MESSAGE };
    if (isAPIError(e) && e.status === "TOO_MANY_REQUESTS") return { error: LOCKED_MESSAGE };
    if (isAPIError(e)) return { error: "Invalid email or password." };
    throw e;
  }
  redirect("/staff");
}

export async function logout() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}
