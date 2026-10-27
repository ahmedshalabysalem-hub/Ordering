import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requirePermission } from "@/server/auth/session";
import { getMenuOverview } from "@/server/menu/service";
import { createProductAction } from "../../actions";
import { ProductForm } from "../../product-form";

export const metadata: Metadata = { title: "Add product" };

export default function NewProductPage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <Link href="/admin/menu" className="text-sm underline">
        ← Menu
      </Link>
      <h1 className="text-2xl font-semibold">Add product</h1>
      <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
        <NewProduct />
      </Suspense>
    </main>
  );
}

async function NewProduct() {
  const staff = await requirePermission("menu.manage");
  const { currency, categories } = await getMenuOverview(staff);
  return <ProductForm action={createProductAction} submitLabel="Add product" currency={currency} categories={categories} />;
}
