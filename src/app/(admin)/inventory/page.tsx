import Link from "next/link";
import { PageHeading } from "@/components/admin/page-heading";
import { prisma } from "@/lib/db/prisma";
import {
  ChevronLeft,
  ChevronRight,
  FolderTree,
  Package,
  Plus,
  Search,
  AlertTriangle,
  Archive,
  Boxes,
  History,
} from "lucide-react";
import { marginPercent, unitProfit, formatUSD } from "@/lib/money";
import { listCategories, listProducts } from "@/lib/repositories/products";
import { archiveProductAction } from "@/app/(admin)/products/actions";
import { ArchiveProductButton } from "@/components/products/archive-product-button";
import { StockTableClient } from "@/components/stock/stock-table-client";
import { CategoryForm } from "@/components/products/category-form";
import { archiveCategoryAction, saveCategoryAction } from "@/app/(admin)/products/actions";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    q?: string;
    category?: string;
    status?: string;
    sort?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const tab = params.tab || "products";

  const tabs = [
    { id: "products", label: "Products", icon: Package },
    { id: "stock", label: "Stock", icon: Boxes },
    { id: "movements", label: "Stock Movements", icon: History },
    { id: "categories", label: "Categories", icon: FolderTree },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageHeading
        title="Inventory"
        description="Catalogue products, track physical and reserved stock levels, inspect movements, and manage categories."
      />

      {/* Tabs navigation */}
      <div className="flex border-b border-slate-800 bg-[#111827]/40 p-1 rounded-xl w-max gap-1">
        {tabs.map((t) => {
          const isActive = tab === t.id;
          const Icon = t.icon;
          return (
            <Link
              key={t.id}
              href={`/inventory?tab=${t.id}`}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
                isActive
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "text-slate-400 border border-transparent hover:text-slate-200 hover:bg-slate-800/40"
              }`}
            >
              <Icon size={14} />
              {t.label}
            </Link>
          );
        })}
      </div>

      {/* Tab content area */}
      <div className="space-y-6">
        {tab === "products" && (
          <ProductsTab params={params} />
        )}

        {tab === "stock" && (
          <StockTab />
        )}

        {tab === "movements" && (
          <MovementsTab />
        )}

        {tab === "categories" && (
          <CategoriesTab />
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------
// Tab Components
// ----------------------------------------------------

async function ProductsTab({
  params
}: {
  params: {
    q?: string;
    category?: string;
    status?: string;
    sort?: string;
    page?: string;
  };
}) {
  const search = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const categoryId = typeof params.category === "string" ? params.category : undefined;
  const status = params.status === "archived" || params.status === "all" ? params.status : "active";
  const sort = params.sort === "newest" || params.sort === "oldest" ? params.sort : "name";
  const requestedPage = Number(params.page ?? "1");
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const [result, categories] = await Promise.all([
    listProducts({ search, page, categoryId, status, sort }),
    listCategories(),
  ]);

  const getQueryString = (nextPage: number) => {
    return new URLSearchParams({
      tab: "products",
      ...(search ? { q: search } : {}),
      ...(categoryId ? { category: categoryId } : {}),
      status,
      sort,
      page: String(nextPage),
    }).toString();
  };

  const isCatalogEmpty = result.total === 0 && search === "";

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Products Catalogue</h3>
        {!isCatalogEmpty && (
          <Link
            href="/products/new"
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-brand-700 transition"
          >
            <Plus size={15} />
            New Product
          </Link>
        )}
      </div>

      {isCatalogEmpty ? (
        <div className="flex flex-col items-center justify-center border border-dashed border-slate-800 rounded-2xl p-12 text-center bg-[#1e293b]/40">
          <Package size={36} className="text-slate-600 mb-3" />
          <h4 className="text-sm font-bold text-slate-200">No products yet</h4>
          <p className="text-xs text-slate-500 mt-1 max-w-sm">Create your first catalog product to start tracking variants, pricing, margins, and custom printing templates.</p>
          <Link
            href="/products/new"
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-brand-700 transition"
          >
            <Plus size={14} />
            Create Product
          </Link>
        </div>
      ) : (
        <>

      {/* Filters form */}
      <form className="grid gap-2 rounded-xl border border-slate-800 bg-[#1e293b] p-3 shadow-sm sm:grid-cols-[minmax(220px,1fr)_180px_140px_140px_auto]">
        <input type="hidden" name="tab" value="products" />
        <label className="relative">
          <span className="sr-only">Search products</span>
          <Search className="absolute left-3 top-2.5 text-slate-500" size={16} />
          <input
            name="q"
            defaultValue={search}
            placeholder="Product name, SKU or category..."
            className="w-full rounded-lg border border-slate-800 bg-[#0f172a] py-2 pl-9 pr-3 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-brand-500 transition"
          />
        </label>
        <select
          name="category"
          defaultValue={categoryId ?? ""}
          className="rounded-lg border border-slate-800 bg-[#0f172a] px-2 text-sm text-slate-200 py-2 focus:outline-none focus:ring-1 focus:ring-brand-500 transition"
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={status}
          className="rounded-lg border border-slate-800 bg-[#0f172a] px-2 text-sm text-slate-200 py-2 focus:outline-none focus:ring-1 focus:ring-brand-500 transition"
        >
          <option value="active">Active</option>
          <option value="archived">Archived</option>
          <option value="all">All statuses</option>
        </select>
        <select
          name="sort"
          defaultValue={sort}
          className="rounded-lg border border-slate-800 bg-[#0f172a] px-2 text-sm text-slate-200 py-2 focus:outline-none focus:ring-1 focus:ring-brand-500 transition"
        >
          <option value="name">Name</option>
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
        </select>
        <button className="rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800/80 px-5 py-2 text-sm font-semibold text-slate-200 transition">
          Apply
        </button>
      </form>

      {/* Table */}
      <div className="rounded-xl border border-slate-800 bg-[#1e293b] shadow-sm overflow-x-auto">
        <table className="w-full min-w-[1000px] text-left text-sm">
          <thead className="bg-[#111827] text-[11px] font-bold uppercase text-slate-500 tracking-wider border-b border-slate-800">
            <tr>
              <th className="px-5 py-3">Product</th>
              <th className="px-4 py-3">Primary SKU</th>
              <th className="px-4 py-3 text-right">Selling Price</th>
              <th className="px-4 py-3 text-right">Cost</th>
              <th className="px-4 py-3 text-right">Profit</th>
              <th className="px-4 py-3 text-right">Margin</th>
              <th className="px-4 py-3 text-right">Stock</th>
              <th className="px-4 py-3 text-center">Status</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {result.products.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-5 py-10 text-center text-slate-500 italic">
                  No products match these filters.
                </td>
              </tr>
            ) : (
              result.products.map((product) => {
                const v = product.variants[0];
                const price = v?.sellingPrice.toFixed(2) ?? "0.00";
                const cost = v?.productionCost.toFixed(2) ?? "0.00";
                const stock = v?.stockQuantity.toString() ?? "0";
                const low = v ? v.stockQuantity.lte(v.reorderLevel) : true;
                return (
                  <tr key={product.id} className="hover:bg-slate-800/20 transition">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <span className="rounded-lg bg-slate-900 border border-slate-800 p-2 text-slate-400">
                          <Package size={17} />
                        </span>
                        <div>
                          <Link
                            href={`/products/${product.id}`}
                            className="font-bold text-slate-100 hover:text-brand-500 hover:underline"
                          >
                            {product.name}
                          </Link>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {product.category?.name ?? "Uncategorised"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-400">
                      {v?.sku ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-100">{formatUSD(price)}</td>
                    <td className="px-4 py-3 text-right text-slate-400">{formatUSD(cost)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-100">{formatUSD(unitProfit(price, cost))}</td>
                    <td className="px-4 py-3 text-right text-slate-400">{marginPercent(price, cost)}%</td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold border ${
                          status === "archived"
                            ? "bg-slate-800 text-slate-500 border-slate-700"
                            : !v || v.stockQuantity.isZero()
                            ? "bg-red-500/10 text-red-400 border-red-500/20"
                            : low
                            ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                            : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        }`}
                      >
                        {!v || v.stockQuantity.isZero()
                          ? "Out of stock"
                          : `${stock} in stock`}
                        {low && v && !v.stockQuantity.isZero() ? (
                          <AlertTriangle size={12} className="ml-1" />
                        ) : null}
                      </span>
                      {v && low && !v.stockQuantity.isZero() ? (
                        <span className="block text-[10px] text-slate-500 mt-0.5">
                          Threshold {v.reorderLevel.toString()}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs font-semibold ${status === "archived" ? "text-slate-500" : "text-emerald-400"}`}>
                        {status === "archived" ? "Archived" : "Active"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right space-x-2 whitespace-nowrap">
                      <Link
                        className="inline-flex rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-300 transition"
                        href={`/products/${product.id}/edit`}
                      >
                        Edit
                      </Link>
                      {status !== "archived" && (
                        <ArchiveProductButton
                          action={archiveProductAction}
                          id={product.id}
                        />
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {result.products.length > 0 && (
        <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
          <p>
            {result.total} product{result.total === 1 ? "" : "s"} found
          </p>
          <div className="flex items-center gap-2">
            <Link
              href={`/inventory?${getQueryString(Math.max(1, page - 1))}`}
              className="rounded-lg border border-slate-800 bg-[#1e293b] p-2 hover:bg-slate-800/80 transition"
            >
              <ChevronLeft size={14} />
            </Link>
            <span>
              Page {Math.min(page, result.pageCount)} of {result.pageCount}
            </span>
            <Link
              href={`/inventory?${getQueryString(Math.min(result.pageCount, page + 1))}`}
              className="rounded-lg border border-slate-800 bg-[#1e293b] p-2 hover:bg-slate-800/80 transition"
            >
              <ChevronRight size={14} />
            </Link>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}

async function StockTab() {
  const [variants, categories, movements] = await Promise.all([
    prisma.productVariant.findMany({
      where: {
        isActive: true,
        product: { isActive: true },
      },
      select: {
        id: true,
        sku: true,
        name: true,
        stockQuantity: true,
        reorderLevel: true,
        sellingPrice: true,
        productionCost: true,
        stockPerUnit: true,
        product: {
          select: {
            name: true,
            categoryId: true,
            category: {
              select: {
                name: true,
              },
            },
          },
        },
        orderItems: {
          where: {
            order: {
              stockCommitted: false,
              status: { not: "Cancelled" },
            },
          },
          select: {
            quantity: true,
          },
        },
      },
      orderBy: { sku: "asc" },
    }),
    prisma.productCategory.findMany({
      where: { isArchived: false },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.stockMovement.findMany({
      where: {
        productVariant: {
          isActive: true,
          product: { isActive: true },
        },
      },
      select: {
        id: true,
        productVariantId: true,
        createdAt: true,
        quantityChange: true,
        stockBefore: true,
        stockAfter: true,
        movementType: true,
        reason: true,
        order: {
          select: {
            orderNumber: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const serializedVariants = variants.map((v) => {
    const currentStock = Number(v.stockQuantity);
    const reorderLevel = Number(v.reorderLevel);
    const stockPerUnit = Number(v.stockPerUnit);
    const reservedStock = v.orderItems.reduce((sum, item) => sum + item.quantity * stockPerUnit, 0);
    const availableStock = Math.max(0, currentStock - reservedStock);

    let status: "Healthy" | "Low Stock" | "Out of Stock" = "Healthy";
    if (currentStock <= 0) {
      status = "Out of Stock";
    } else if (currentStock <= reorderLevel) {
      status = "Low Stock";
    }

    return {
      id: v.id,
      sku: v.sku,
      name: v.name,
      productName: v.product.name,
      categoryId: v.product.categoryId,
      categoryName: v.product.category?.name ?? "Uncategorized",
      currentStock,
      reservedStock,
      availableStock,
      reorderLevel,
      sellingPrice: Number(v.sellingPrice),
      productionCost: Number(v.productionCost),
      stockPerUnit,
      status,
    };
  });

  const serializedMovements = movements.map((m) => ({
    id: m.id,
    variantId: m.productVariantId,
    createdAt: m.createdAt.toISOString(),
    quantityChange: Number(m.quantityChange),
    stockBefore: Number(m.stockBefore),
    stockAfter: Number(m.stockAfter),
    movementType: m.movementType,
    reason: m.reason,
    orderNumber: m.order?.orderNumber ?? null,
  }));

  return (
    <StockTableClient
      variants={serializedVariants}
      categories={categories}
      movements={serializedMovements}
    />
  );
}

async function MovementsTab() {
  const movements = await prisma.stockMovement.findMany({
    where: {
      productVariant: {
        isActive: true,
        product: { isActive: true },
      },
    },
    include: {
      productVariant: {
        include: {
          product: true,
        },
      },
      order: {
        select: {
          orderNumber: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const getMovementTypeLabel = (type: string) => {
    switch (type) {
      case "manual_addition": return "Addition";
      case "manual_removal": return "Removal";
      case "order_commit": return "Committed";
      case "order_restore": return "Restored";
      case "order_commit_adjustment":
      case "order_restore_adjustment": return "Adjustment";
      case "correction": return "Correction";
      case "damage": return "Damage";
      case "return": return "Return";
      default: return type;
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Stock Movements History</h3>
      <div className="rounded-xl border border-slate-800 bg-[#1e293b] shadow-sm overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-xs border-collapse">
          <thead className="bg-[#111827] font-bold uppercase text-slate-500 text-[10px] tracking-wider border-b border-slate-800">
            <tr>
              <th className="px-5 py-3.5">When</th>
              <th className="px-4 py-3.5">Product Variant</th>
              <th className="px-4 py-3.5">SKU</th>
              <th className="px-4 py-3.5 text-right">Change</th>
              <th className="px-4 py-3.5 text-right">Before → After</th>
              <th className="px-4 py-3.5">Type</th>
              <th className="px-5 py-3.5">Reason / Reference</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-slate-300">
            {movements.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-slate-500 italic">
                  No stock movements recorded yet.
                </td>
              </tr>
            ) : (
              movements.map((m) => {
                const change = Number(m.quantityChange);
                return (
                  <tr key={m.id} className="hover:bg-slate-800/20 transition">
                    <td className="px-5 py-3 whitespace-nowrap text-slate-400">
                      {m.createdAt.toLocaleString("en-GB", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-200">{m.productVariant.product.name}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{m.productVariant.name}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-[10px] text-slate-400">{m.productVariant.sku}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <span className={`font-semibold ${change > 0 ? "text-emerald-500" : "text-rose-500"}`}>
                        {change > 0 ? "+" : ""}
                        {change.toString()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-500">
                      {m.stockBefore.toString()} → {m.stockAfter.toString()}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-400">
                      {getMovementTypeLabel(m.movementType)}
                    </td>
                    <td className="px-5 py-3 text-slate-400 max-w-[250px] truncate" title={m.reason}>
                      {m.reason}
                      {m.order?.orderNumber && (
                        <span className="inline-flex items-center ml-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          {m.order.orderNumber}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

async function CategoriesTab() {
  const categories = await listCategories();
  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-3">
        {/* Left Column: Form */}
        <section className="rounded-xl border border-slate-800 bg-[#1e293b] p-5 shadow-sm">
          <h2 className="font-bold text-sm text-slate-200 tracking-wide mb-4">New Category</h2>
          <CategoryForm action={saveCategoryAction} />
        </section>

        {/* Right Column: List (span 2) */}
        <section className="md:col-span-2 space-y-3">
          <h2 className="font-bold text-sm text-slate-400 tracking-wide mb-1.5">Active Categories</h2>
          {categories.filter((c) => !c.isArchived).length === 0 ? (
            <div className="flex flex-col items-center justify-center border border-dashed border-slate-800 rounded-2xl p-12 text-center bg-[#1e293b]/40">
              <FolderTree size={36} className="text-slate-600 mb-3" />
              <h4 className="text-sm font-bold text-slate-200">No categories yet</h4>
              <p className="text-xs text-slate-500 mt-1">Use the &ldquo;New Category&rdquo; form on the left to create your first category.</p>
            </div>
          ) : (
            categories
              .filter((category) => !category.isArchived)
              .map((category) => (
                <article
                  key={category.id}
                  className="rounded-xl border border-slate-800 bg-[#1e293b] p-5 shadow-sm"
                >
                  <CategoryForm category={category} action={saveCategoryAction} />
                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-500 font-medium">
                    <span>
                      {category._count.products} linked product
                      {category._count.products === 1 ? "" : "s"}
                    </span>
                    <form action={archiveCategoryAction}>
                      <input type="hidden" name="id" value={category.id} />
                      <button className="inline-flex items-center gap-1 text-red-400 hover:text-red-300 transition-colors">
                        <Archive size={14} />
                        Archive
                      </button>
                    </form>
                  </div>
                </article>
              ))
          )}
        </section>
      </div>
    </div>
  );
}
