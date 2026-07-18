import { WorkflowHeader } from "@/components/admin/workflow-header";
import { ProductForm } from "@/components/products/product-form";
import { getProductFormOptions } from "@/lib/repositories/products";
import { createProductAction } from "../actions";

// Product form options come from the runtime SQLite database. Force a fresh
// lookup so newly created print templates appear in packaged desktop builds.
export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  const [categories, templates] = await getProductFormOptions();
  return (
    <>
      <WorkflowHeader
        title="New product"
        description="Create a product and at least one stock-keeping variant."
        backLabel="Back to Products"
        fallbackRoute="/products"
      />
      <ProductForm
        action={createProductAction}
        categories={categories}
        templates={templates}
      />
    </>
  );
}
