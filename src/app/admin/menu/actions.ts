"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { AuthError, authorize } from "@/server/auth/session";
import { ImageError } from "@/server/media/images";
import {
  createCategory,
  createProduct,
  type ImageChange,
  MenuError,
  setProductAvailability,
  updateCategory,
  updateProduct,
} from "@/server/menu/service";
import { MoneyError } from "@/server/money";

export type FormState = { error?: string; ok?: string };

const FIELD_LABELS: Record<string, string> = {
  nameAr: "Name (Arabic)",
  nameEn: "Name (English)",
  descriptionAr: "Description (Arabic)",
  descriptionEn: "Description (English)",
  categoryId: "Category",
  sku: "SKU",
  sortOrder: "Display order",
  prepStation: "Preparation station",
  prepMinutes: "Preparation time",
};

function toMessage(e: unknown): string {
  if (e instanceof MenuError || e instanceof MoneyError || e instanceof ImageError || e instanceof AuthError) return e.message;
  if (e instanceof ZodError) {
    const field = String(e.issues[0]?.path[0] ?? "");
    return `Check ${FIELD_LABELS[field] ?? "the form"}.`;
  }
  throw e;
}

const text = (formData: FormData, key: string) => (formData.get(key) as string | null) ?? undefined;

function categoryForm(formData: FormData) {
  return {
    nameAr: text(formData, "nameAr") ?? "",
    nameEn: text(formData, "nameEn") ?? "",
    sortOrder: text(formData, "sortOrder") || 0,
    isActive: formData.get("isActive") === "on",
  };
}

function productForm(formData: FormData) {
  return {
    categoryId: text(formData, "categoryId") ?? "",
    nameAr: text(formData, "nameAr") ?? "",
    nameEn: text(formData, "nameEn") ?? "",
    descriptionAr: text(formData, "descriptionAr"),
    descriptionEn: text(formData, "descriptionEn"),
    price: text(formData, "price") ?? "",
    sku: text(formData, "sku"),
    sortOrder: text(formData, "sortOrder") || 0,
    isAvailable: formData.get("isAvailable") === "on",
    isActive: formData.get("isActive") === "on",
    prepStation: text(formData, "prepStation"),
    prepMinutes: text(formData, "prepMinutes") ?? "",
  };
}

async function imageChange(formData: FormData): Promise<ImageChange> {
  const file = formData.get("image");
  const upload = file instanceof File && file.size > 0 ? new Uint8Array(await file.arrayBuffer()) : undefined;
  return { upload, remove: formData.get("removeImage") === "on" };
}

export async function createCategoryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const staff = await authorize("menu.manage");
    await createCategory(staff, categoryForm(formData));
  } catch (e) {
    return { error: toMessage(e) };
  }
  revalidatePath("/admin/menu");
  return { ok: "Category added." };
}

export async function updateCategoryAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const staff = await authorize("menu.manage");
    await updateCategory(staff, id, categoryForm(formData));
  } catch (e) {
    return { error: toMessage(e) };
  }
  revalidatePath("/admin/menu");
  return { ok: "Saved." };
}

export async function createProductAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const staff = await authorize("menu.manage");
    await createProduct(staff, productForm(formData), await imageChange(formData));
  } catch (e) {
    return { error: toMessage(e) };
  }
  revalidatePath("/admin/menu");
  redirect("/admin/menu");
}

export async function updateProductAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const staff = await authorize("menu.manage");
    await updateProduct(staff, id, productForm(formData), await imageChange(formData));
  } catch (e) {
    return { error: toMessage(e) };
  }
  revalidatePath("/admin/menu");
  revalidatePath(`/admin/menu/products/${id}`);
  return { ok: "Saved." };
}

export async function setAvailabilityAction(id: string, isAvailable: boolean): Promise<void> {
  const staff = await authorize("product.toggle_availability");
  await setProductAvailability(staff, id, isAvailable);
  revalidatePath("/admin/menu");
}
