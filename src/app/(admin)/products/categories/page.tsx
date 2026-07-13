import { Archive } from "lucide-react";
import { PageHeading } from "@/components/admin/page-heading";
import { CategoryForm } from "@/components/products/category-form";
import { listCategories } from "@/lib/repositories/products";
import { archiveCategoryAction, saveCategoryAction } from "../actions";

export default async function CategoriesPage() {
  const categories = await listCategories();
  return (
    <>
      <PageHeading
        title="Product categories"
        description="Create, rename and archive catalogue categories."
      />
      <section className="mt-8 rounded-2xl border bg-white p-6 shadow-panel">
        <h2 className="font-semibold">New category</h2>
        <div className="mt-4">
          <CategoryForm action={saveCategoryAction} />
        </div>
      </section>
      <section className="mt-6 space-y-3">
        {categories
          .filter((category) => !category.isArchived)
          .map((category) => (
            <article
              key={category.id}
              className="rounded-2xl border bg-white p-5 shadow-panel"
            >
              <CategoryForm category={category} action={saveCategoryAction} />
              <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
                <span>
                  {category._count.products} linked product
                  {category._count.products === 1 ? "" : "s"}
                </span>
                <form action={archiveCategoryAction}>
                  <input type="hidden" name="id" value={category.id} />
                  <button className="inline-flex items-center gap-1 text-red-700">
                    <Archive size={15} />
                    Archive
                  </button>
                </form>
              </div>
            </article>
          ))}
      </section>
    </>
  );
}
