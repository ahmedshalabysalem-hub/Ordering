import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requirePermission } from "@/server/auth/session";
import { getCategory } from "@/server/menu/service";
import { updateCategoryAction } from "../../actions";
import { CategoryForm } from "../../category-form";

export const metadata: Metadata = { title: "Edit category" };

export default function CategoryPage({ params }: PageProps<"/admin/menu/categories/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <Link href="/admin/menu" className="text-sm underline">
        ← Menu
      </Link>
      <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
        <CategoryDetails params={params} />
      </Suspense>
    </main>
  );
}

async function CategoryDetails({ params }: { params: PageProps<"/admin/menu/categories/[id]">["params"] }) {
  const staff = await requirePermission("menu.manage");
  const { id } = await params;
  const category = await getCategory(staff, id);
  if (!category) notFound();
  return (
    <>
      <h1 className="text-2xl font-semibold">Edit category {category.nameEn}</h1>
      <p className="text-sm text-zinc-600">Untick Active to hide the category and its products from customers. Categories are never deleted.</p>
      <CategoryForm action={updateCategoryAction.bind(null, category.id)} submitLabel="Save" defaults={category} />
    </>
  );
}
