import { notFound } from "next/navigation";
import { PageHeading } from "@/components/admin/page-heading";
import { ProductForm } from "@/components/products/product-form";
import { getProduct, getProductFormOptions } from "@/lib/repositories/products";
import { entityIdSchema } from "@/lib/validation/product";
import { updateProductAction } from "../../actions";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!entityIdSchema.safeParse(id).success) notFound();
  const product = await getProduct(id);
  if (!product || !product.isActive) notFound();
  const options = await getProductFormOptions(product.categoryId || undefined);
  const productForForm = {
    name: product.name,
    description: product.description,
    categoryId: product.categoryId,
    printTemplateId: product.printTemplateId,
    variants: product.variants.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      name: variant.name,
      optionName: variant.optionName,
      optionValue: variant.optionValue,
      sellingPrice: variant.sellingPrice.toFixed(2),
      productionCost: variant.productionCost.toFixed(2),
      stockQuantity: variant.stockQuantity.toString(),
      reorderLevel: variant.reorderLevel.toString(),
      stockPerUnit: variant.stockPerUnit.toString(),
    })),
  };
  return (
    <>
      <PageHeading title="Edit product" description={product.name} />
      <ProductForm
        product={productForForm}
        categories={options[0]}
        templates={options[1]}
        action={updateProductAction.bind(null, id)}
      />
    </>
  );
}
