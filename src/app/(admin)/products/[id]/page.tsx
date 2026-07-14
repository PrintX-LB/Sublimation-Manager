import Link from "next/link";
import { AlertTriangle, Archive, Pencil } from "lucide-react";
import { notFound } from "next/navigation";
import { PageHeading } from "@/components/admin/page-heading";
import { BackNavigation } from "@/components/admin/back-navigation";
import { marginPercent, unitProfit, formatUSD } from "@/lib/money";
import { getProduct } from "@/lib/repositories/products";
import { entityIdSchema } from "@/lib/validation/product";
import { archiveProductAction } from "../actions";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!entityIdSchema.safeParse(id).success) notFound();
  const product = await getProduct(id);
  if (!product || !product.isActive) notFound();
  return (
    <>
      <BackNavigation label="Back to Products" fallbackRoute="/products" />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeading
          title={product.name}
          description={`${product.category?.name ?? "Uncategorised"}${product.printTemplate ? ` · ${product.printTemplate.name}` : ""}`}
        />
        <div className="flex gap-2">
          <Link
            href={`/products/${id}/edit`}
            className="inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-2.5 text-sm font-semibold"
          >
            <Pencil size={17} />
            Edit
          </Link>
          <form action={archiveProductAction}>
            <input type="hidden" name="id" value={id} />
            <button className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700">
              <Archive size={17} />
              Archive
            </button>
          </form>
        </div>
      </div>
      <section className="mt-8 rounded-2xl border bg-white p-6 shadow-panel">
        <h2 className="font-semibold">Description</h2>
        <p className="mt-3 text-sm text-slate-600">
          {product.description || "No description."}
        </p>
      </section>
      <section className="mt-6 overflow-hidden rounded-2xl border bg-white shadow-panel">
        <div className="border-b px-6 py-4">
          <h2 className="font-semibold">Variants and stock</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-400">
              <tr>
                <th className="px-5 py-3">Variant</th>
                <th>SKU</th>
                <th>Price</th>
                <th>Cost</th>
                <th>Profit / margin</th>
                <th>Stock</th>
                <th>Consumes</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {product.variants.map((variant) => {
                const price = variant.sellingPrice.toFixed(2);
                const cost = variant.productionCost.toFixed(2);
                const low = variant.stockQuantity.lte(variant.reorderLevel);
                return (
                  <tr key={variant.id}>
                    <td className="px-5 py-4 font-medium">
                      {variant.optionName && variant.optionValue
                        ? `${variant.optionName}: ${variant.optionValue}`
                        : variant.name}
                    </td>
                    <td className="font-mono text-xs">{variant.sku}</td>
                    <td>{formatUSD(Number(price))}</td>
                    <td>{formatUSD(Number(cost))}</td>
                    <td>
                      {formatUSD(Number(unitProfit(price, cost)))} · {marginPercent(price, cost)}%
                    </td>
                    <td>
                      {low ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
                          <AlertTriangle size={15} />
                          {variant.stockQuantity.toString()} (threshold{" "}
                          {variant.reorderLevel.toString()})
                        </span>
                      ) : (
                        variant.stockQuantity.toString()
                      )}
                    </td>
                    <td>{variant.stockPerUnit.toString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
