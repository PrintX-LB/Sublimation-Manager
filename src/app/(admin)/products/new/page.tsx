import { WorkflowHeader } from "@/components/admin/workflow-header";
import { ProductForm } from "@/components/products/product-form";
import { getProductFormOptions } from "@/lib/repositories/products";
import { createProductAction } from "../actions";

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
