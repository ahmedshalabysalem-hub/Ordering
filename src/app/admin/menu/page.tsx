import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requirePermission } from "@/server/auth/session";
import { getMenuOverview } from "@/server/menu/service";
import { formatMoney } from "@/server/money";
import { createCategoryAction, setAvailabilityAction } from "./actions";
import { CategoryForm } from "./category-form";

export const metadata: Metadata = { title: "Menu" };

export default function MenuPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Menu</h1>
      <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
        <MenuOverview />
      </Suspense>
    </main>
  );
}

async function MenuOverview() {
  const staff = await requirePermission("menu.manage");
  const { currency, categories } = await getMenuOverview(staff);
  return (
    <>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Add a category</h2>
        <CategoryForm action={createCategoryAction} submitLabel="Add category" />
      </section>
      <div className="flex flex-wrap items-center gap-4">
        {categories.length > 0 && (
          <Link href="/admin/menu/products/new" className="rounded-md bg-zinc-900 px-4 py-2 font-medium text-white">
            Add product
          </Link>
        )}
        <Link href="/admin/menu/options" className="underline">
          Option groups (sizes, extras)
        </Link>
      </div>
      {categories.length === 0 && <p className="text-zinc-600">No categories yet. Add one above, then add products to it.</p>}
      {categories.map((category) => (
        <section key={category.id} className="flex flex-col gap-2" aria-labelledby={`category-${category.id}`}>
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 id={`category-${category.id}`} className="text-lg font-medium">
              {category.nameEn} · <span dir="rtl">{category.nameAr}</span>
            </h2>
            {!category.isActive && <span className="text-sm text-red-700">Hidden</span>}
            <Link href={`/admin/menu/categories/${category.id}`} className="text-sm underline">
              Edit category {category.nameEn}
            </Link>
          </div>
          {category.products.length === 0 ? (
            <p className="text-sm text-zinc-600">No products in this category.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-zinc-600">
                  <th className="py-2 text-start">Product</th>
                  <th className="py-2 text-start">Price</th>
                  <th className="py-2 text-start">Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {category.products.map((p) => (
                  <tr key={p.id} className="border-b">
                    <td className="py-2">
                      <span className="font-medium">{p.nameEn}</span> · <span dir="rtl">{p.nameAr}</span>
                    </td>
                    <td className="py-2" data-testid={`price-${p.nameEn}`}>
                      {formatMoney(p.priceMinor, currency)}
                    </td>
                    <td className="py-2">
                      {p.isAvailable ? "Available" : "Sold out"}
                      {!p.isActive && <span className="ms-2 text-red-700">Hidden</span>}
                    </td>
                    <td className="flex justify-end gap-3 py-2">
                      <form action={setAvailabilityAction.bind(null, p.id, !p.isAvailable)}>
                        <button type="submit" className="underline">
                          {p.isAvailable ? `Mark ${p.nameEn} sold out` : `Mark ${p.nameEn} available`}
                        </button>
                      </form>
                      <Link href={`/admin/menu/products/${p.id}`} className="underline">
                        Edit {p.nameEn}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ))}
    </>
  );
}
