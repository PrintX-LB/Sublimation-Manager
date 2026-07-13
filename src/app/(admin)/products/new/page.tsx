import { PageHeading } from "@/components/admin/page-heading";
import { ProductForm } from "@/components/products/product-form";
import { getProductFormOptions } from "@/lib/repositories/products";
import { createProductAction } from "../actions";

export default async function NewProductPage() {
  const [categories, templates] = await getProductFormOptions();
  return (
    <>
      <PageHeading
        title="New product"
        description="Create a product and at least one stock-keeping variant."
      />
      <ProductForm
        action={createProductAction}
        categories={categories}
        templates={templates}
      />
    </>
  );
}
