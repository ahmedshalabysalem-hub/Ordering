import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requirePermission } from "@/server/auth/session";
import { getMenuOverview, getProduct } from "@/server/menu/service";
import { minorToDecimal } from "@/server/money";
import { updateProductAction } from "../../actions";
import { ProductForm } from "../../product-form";

export const metadata: Metadata = { title: "Edit product" };

export default function ProductPage({ params }: PageProps<"/admin/menu/products/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <Link href="/admin/menu" className="text-sm underline">
        ← Menu
      </Link>
      <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
        <ProductDetails params={params} />
      </Suspense>
    </main>
  );
}

async function ProductDetails({ params }: { params: PageProps<"/admin/menu/products/[id]">["params"] }) {
  const staff = await requirePermission("menu.manage");
  const { id } = await params;
  const [product, { currency, categories }] = await Promise.all([getProduct(staff, id), getMenuOverview(staff)]);
  if (!product) notFound();
  return (
    <>
      <h1 className="text-2xl font-semibold">Edit {product.nameEn}</h1>
      <p className="text-sm text-zinc-600">
        Price changes apply to new orders only; past orders keep the price they were placed with. Untick &quot;Shown on the
        menu&quot; instead of deleting.
      </p>
      <ProductForm
        action={updateProductAction.bind(null, product.id)}
        submitLabel="Save"
        currency={currency}
        categories={categories}
        defaults={{ ...product, price: minorToDecimal(product.priceMinor, currency) }}
      />
    </>
  );
}
