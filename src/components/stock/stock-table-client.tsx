"use client";

import { useState, useTransition, useMemo } from "react";
import {
  Search,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  History,
  Coins,
  Package,
  X,
  ChevronDown,
} from "lucide-react";
import { addStockAction, removeStockAction } from "@/app/(admin)/stock/actions";
import { formatUSD } from "@/lib/money";

interface SerializedVariant {
  id: string;
  name: string;
  productName: string;
  categoryId: string | null;
  categoryName: string;
  currentStock: number;
  reservedStock: number;
  availableStock: number;
  reorderLevel: number;
  sellingPrice: number;
  productionCost: number;
  stockPerUnit: number;
  status: "Healthy" | "Low Stock" | "Out of Stock";
}

interface SerializedMovement {
  id: string;
  variantId: string;
  createdAt: string;
  quantityChange: number;
  stockBefore: number;
  stockAfter: number;
  movementType: string;
  reason: string;
  orderNumber: string | null;
}

interface CategoryOption {
  id: string;
  name: string;
}

export function StockTableClient({
  variants,
  categories,
  movements,
}: {
  variants: SerializedVariant[];
  categories: CategoryOption[];
  movements: SerializedMovement[];
}) {
  // Filter States
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [lowStockFilter, setLowStockFilter] = useState(false);
  const [outOfStockFilter, setOutOfStockFilter] = useState(false);
  const [sortBy, setSortBy] = useState("product-name");

  // Modal States
  const [adjustingVariant, setAdjustingVariant] =
    useState<SerializedVariant | null>(null);
  const [adjustType, setAdjustType] = useState<"increase" | "decrease">(
    "increase",
  );
  const [adjustQuantity, setAdjustQuantity] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustError, setAdjustError] = useState("");

  const [historyVariant, setHistoryVariant] =
    useState<SerializedVariant | null>(null);

  const [isPending, startTransition] = useTransition();

  // Summary Metrics (always computed globally over all active variants)
  const globalStats = useMemo(() => {
    const totalProducts = variants.length;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    let totalValuation = 0;

    for (const v of variants) {
      if (v.status === "Low Stock") {
        lowStockCount++;
      } else if (v.status === "Out of Stock") {
        outOfStockCount++;
      }
      totalValuation += v.currentStock * v.productionCost;
    }

    return {
      totalProducts,
      lowStockCount,
      outOfStockCount,
      totalValuation,
    };
  }, [variants]);

  // Handle stock adjustment save
  const handleSaveAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingVariant) return;
    setAdjustError("");

    if (
      !/^\d+$/.test(adjustQuantity) ||
      parseFloat(adjustQuantity) <= 0 ||
      isNaN(parseFloat(adjustQuantity))
    ) {
      setAdjustError("Inventory quantities must be whole units.");
      return;
    }

    if (adjustType === "decrease" && !adjustReason.trim()) {
      setAdjustError("A reason for adjustment is required.");
      return;
    }

    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("variantId", adjustingVariant.id);
        formData.append("amount", adjustQuantity);
        formData.append("reason", adjustReason.trim());

        if (adjustType === "increase") {
          await addStockAction(formData);
        } else {
          await removeStockAction(formData);
        }

        // Close and reset
        setAdjustingVariant(null);
        setAdjustQuantity("");
        setAdjustReason("");
      } catch (err: unknown) {
        setAdjustError(
          err instanceof Error ? err.message : "Something went wrong.",
        );
      }
    });
  };

  // Filtered and Sorted Variants for Table Display
  const filteredAndSortedVariants = useMemo(() => {
    let result = [...variants];

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (v) =>
          v.productName.toLowerCase().includes(q) ||
          v.name.toLowerCase().includes(q),
      );
    }

    // Category
    if (categoryFilter !== "all") {
      result = result.filter((v) => v.categoryId === categoryFilter);
    }

    // Low stock only
    if (lowStockFilter) {
      result = result.filter((v) => v.status === "Low Stock");
    }

    // Out of stock only
    if (outOfStockFilter) {
      result = result.filter((v) => v.status === "Out of Stock");
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case "product-name":
          return `${a.productName} ${a.name}`.localeCompare(
            `${b.productName} ${b.name}`,
          );
        case "stock-asc":
          return a.currentStock - b.currentStock;
        case "stock-desc":
          return b.currentStock - a.currentStock;
        case "available-asc":
          return a.availableStock - b.availableStock;
        case "available-desc":
          return b.availableStock - a.availableStock;
        case "min-stock-asc":
          return a.reorderLevel - b.reorderLevel;
        case "min-stock-desc":
          return b.reorderLevel - a.reorderLevel;
        default:
          return 0;
      }
    });

    return result;
  }, [
    variants,
    search,
    categoryFilter,
    lowStockFilter,
    outOfStockFilter,
    sortBy,
  ]);

  // Last movements mapped by variant ID for faster lookup in table
  const lastMovementsByVariant = useMemo(() => {
    const map: Record<string, SerializedMovement> = {};
    for (const m of movements) {
      if (!map[m.variantId]) {
        map[m.variantId] = m;
      }
    }
    return map;
  }, [movements]);

  // Movements filtered for currently selected history variant
  const selectedHistoryMovements = useMemo(() => {
    if (!historyVariant) return [];
    return movements.filter((m) => m.variantId === historyVariant.id);
  }, [movements, historyVariant]);

  const formatRelativeTime = (isoString: string) => {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return "Yesterday";
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
    });
  };

  const getMovementTypeLabel = (type: string) => {
    switch (type) {
      case "manual_addition":
        return "Addition";
      case "manual_removal":
        return "Removal";
      case "order_commit":
        return "Committed";
      case "order_restore":
        return "Restored";
      case "order_commit_adjustment":
      case "order_restore_adjustment":
        return "Adjustment";
      case "correction":
        return "Correction";
      case "damage":
        return "Damage";
      case "return":
        return "Return";
      default:
        return type;
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <article className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Total Products
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-900">
              {globalStats.totalProducts}
            </p>
            <p className="mt-1 text-xs font-medium text-slate-400">
              Product variants monitored
            </p>
          </div>
          <div className="rounded-lg bg-blue-50 p-3 text-blue-600">
            <Package size={20} />
          </div>
        </article>

        <article className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Low Stock
            </p>
            <p className="mt-1 text-2xl font-bold text-amber-700">
              {globalStats.lowStockCount}
            </p>
            <p className="mt-1 text-xs font-medium text-slate-400">
              Below low-stock threshold
            </p>
          </div>
          <div className="rounded-lg bg-amber-50 p-3 text-amber-600">
            <AlertTriangle size={20} />
          </div>
        </article>

        <article className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Out of Stock
            </p>
            <p className="mt-1 text-2xl font-bold text-red-600">
              {globalStats.outOfStockCount}
            </p>
            <p className="mt-1 text-xs font-medium text-slate-400">
              Zero or negative inventory
            </p>
          </div>
          <div className="rounded-lg bg-red-50 p-3 text-red-600">
            <XCircle size={20} />
          </div>
        </article>

        <article className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Inventory Value
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-900">
              {formatUSD(globalStats.totalValuation)}
            </p>
            <p className="mt-1 text-xs font-medium text-slate-400">
              At blank product cost
            </p>
          </div>
          <div className="rounded-lg bg-emerald-50 p-3 text-emerald-600">
            <Coins size={20} />
          </div>
        </article>
      </section>

      {/* Filter and Control Bar */}
      <section className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative w-full max-w-xs">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              placeholder="Search product or variant..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-sm transition focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          {/* Category Filter */}
          <div className="relative">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="appearance-none rounded-xl border border-slate-200 bg-slate-50 py-2 pl-3 pr-8 text-sm transition focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="all">All Categories</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
          </div>

          {/* Checkboxes */}
          <div className="flex items-center gap-4">
            <label className="flex cursor-pointer select-none items-center gap-2 text-sm font-medium text-slate-600">
              <input
                type="checkbox"
                checked={lowStockFilter}
                onChange={(e) => setLowStockFilter(e.target.checked)}
                className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              Low Stock Only
            </label>
            <label className="flex cursor-pointer select-none items-center gap-2 text-sm font-medium text-slate-600">
              <input
                type="checkbox"
                checked={outOfStockFilter}
                onChange={(e) => setOutOfStockFilter(e.target.checked)}
                className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              Out of Stock Only
            </label>
          </div>
        </div>

        {/* Sort and Reset */}
        <div className="flex shrink-0 items-center gap-3">
          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="appearance-none rounded-xl border border-slate-200 bg-slate-50 py-2 pl-3 pr-8 text-sm transition focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="product-name">Product Name A-Z</option>
              <option value="stock-asc">Current Stock (Low–High)</option>
              <option value="stock-desc">Current Stock (High–Low)</option>
              <option value="available-asc">Available (Low–High)</option>
              <option value="available-desc">Available (High–Low)</option>
              <option value="min-stock-asc">Min Stock (Low–High)</option>
              <option value="min-stock-desc">Min Stock (High–Low)</option>
            </select>
            <ChevronDown
              size={14}
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
          </div>

          {(search ||
            categoryFilter !== "all" ||
            lowStockFilter ||
            outOfStockFilter) && (
            <button
              onClick={() => {
                setSearch("");
                setCategoryFilter("all");
                setLowStockFilter(false);
                setOutOfStockFilter(false);
              }}
              className="text-xs font-semibold text-brand-600 transition hover:text-brand-700"
            >
              Reset Filters
            </button>
          )}
        </div>
      </section>

      {/* Main Inventory Table */}
      <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[1000px] text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-5 py-3.5">Product</th>
              <th className="px-4 py-3.5 text-right">Current Stock</th>
              <th className="px-4 py-3.5 text-right">Reserved Stock</th>
              <th className="px-4 py-3.5 text-right">Available Stock</th>
              <th className="px-4 py-3.5 text-right">Min Stock</th>
              <th className="px-4 py-3.5 text-center">Status</th>
              <th className="px-4 py-3.5">Last Movement</th>
              <th className="px-5 py-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredAndSortedVariants.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-5 py-12 text-center italic text-slate-400"
                >
                  No matching inventory items found.
                </td>
              </tr>
            ) : (
              filteredAndSortedVariants.map((v) => {
                const lastMov = lastMovementsByVariant[v.id];

                return (
                  <tr key={v.id} className="transition hover:bg-slate-50/50">
                    {/* Product */}
                    <td className="px-5 py-3">
                      <div className="font-semibold text-slate-900">
                        {v.productName}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {v.name} • {v.categoryName}
                      </div>
                    </td>

                    {/* Current Stock */}
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">
                      {v.currentStock.toString()}
                    </td>

                    {/* Reserved Stock */}
                    <td className="px-4 py-3 text-right text-slate-500">
                      {v.reservedStock > 0 ? v.reservedStock.toString() : "—"}
                    </td>

                    {/* Available Stock */}
                    <td
                      className={`px-4 py-3 text-right font-semibold ${v.availableStock <= 0 ? "text-red-600" : "text-slate-900"}`}
                    >
                      {v.availableStock.toString()}
                    </td>

                    {/* Minimum Stock */}
                    <td className="px-4 py-3 text-right text-slate-500">
                      {v.reorderLevel.toString()}
                    </td>

                    {/* Status Badge */}
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                          v.status === "Healthy"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : v.status === "Low Stock"
                              ? "border-amber-200 bg-amber-50 text-amber-700"
                              : "border-red-200 bg-red-50 text-red-700"
                        }`}
                      >
                        {v.status === "Healthy" && <CheckCircle2 size={12} />}
                        {v.status === "Low Stock" && (
                          <AlertTriangle size={12} />
                        )}
                        {v.status === "Out of Stock" && <XCircle size={12} />}
                        {v.status}
                      </span>
                    </td>

                    {/* Last Stock Movement */}
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {lastMov ? (
                        <div>
                          <span
                            className={`font-semibold ${
                              lastMov.quantityChange > 0
                                ? "text-emerald-600"
                                : "text-rose-600"
                            }`}
                          >
                            {lastMov.quantityChange > 0 ? "+" : ""}
                            {lastMov.quantityChange.toString()}
                          </span>
                          <span className="text-slate-400">
                            {" "}
                            ({getMovementTypeLabel(lastMov.movementType)})
                          </span>
                          <div className="mt-0.5 text-[10px] text-slate-400">
                            {formatRelativeTime(lastMov.createdAt)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="space-x-2 whitespace-nowrap px-5 py-3 text-right">
                      <button
                        onClick={() => {
                          setAdjustingVariant(v);
                          setAdjustType("increase");
                          setAdjustQuantity("");
                          setAdjustReason("");
                          setAdjustError("");
                        }}
                        className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                      >
                        Adjust Stock
                      </button>
                      <button
                        onClick={() => setHistoryVariant(v)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                        title="View history"
                      >
                        <History size={13} />
                        History
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>

      {/* Adjust Stock Modal */}
      {adjustingVariant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="animate-in fade-in zoom-in-95 w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-6 py-4">
              <h3 className="text-base font-bold text-slate-900">
                Adjust Stock
              </h3>
              <button
                onClick={() => setAdjustingVariant(null)}
                className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveAdjustment} className="space-y-4 p-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Product Variant
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {adjustingVariant.productName}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {adjustingVariant.name}
                </p>
              </div>

              <div className="flex justify-between rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm">
                <div>
                  <span className="text-xs text-slate-500">Current Stock</span>
                  <p className="mt-0.5 text-lg font-bold text-slate-900">
                    {adjustingVariant.currentStock}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-slate-500">
                    Available Stock
                  </span>
                  <p className="mt-0.5 text-lg font-bold text-slate-900">
                    {adjustingVariant.availableStock}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-slate-500">Reserved Stock</span>
                  <p className="mt-0.5 text-lg font-bold text-slate-900">
                    {adjustingVariant.reservedStock}
                  </p>
                </div>
              </div>

              {/* Selector */}
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Adjustment Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjustType("increase")}
                    className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                      adjustType === "increase"
                        ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    Add Stock
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustType("decrease")}
                    className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                      adjustType === "decrease"
                        ? "border-rose-500 bg-rose-50 text-rose-700"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    Remove Stock
                  </button>
                </div>
              </div>

              {/* Quantity */}
              <div>
                <label
                  htmlFor="adjust-qty"
                  className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500"
                >
                  Quantity *
                </label>
                <input
                  id="adjust-qty"
                  type="number"
                  step="1"
                  min="0"
                  required
                  placeholder="e.g. 10"
                  value={adjustQuantity}
                  onChange={(e) => setAdjustQuantity(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm transition focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              {/* Reason is required for corrections/removals, optional for receiving stock. */}
              <div>
                <label
                  htmlFor="adjust-reason"
                  className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500"
                >
                  Reason{adjustType === "decrease" ? " *" : " (optional)"}
                </label>
                <input
                  id="adjust-reason"
                  type="text"
                  required={adjustType === "decrease"}
                  placeholder={adjustType === "decrease" ? "e.g. Stock recount" : "Optional receiving note"}
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm transition focus:outline-none focus:ring-1 focus:ring-brand-500"
                  maxLength={500}
                />
              </div>

              {adjustError && (
                <p
                  role="alert"
                  className="rounded-lg border border-red-100 bg-red-50 p-2.5 text-xs text-red-600"
                >
                  {adjustError}
                </p>
              )}

              {/* Action Buttons */}
              <div className="mt-6 flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setAdjustingVariant(null)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-50"
                >
                  {isPending ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* History Modal */}
      {historyVariant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="animate-in fade-in zoom-in-95 flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl duration-150">
            {/* Modal Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-slate-50 px-6 py-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Stock Movement History
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  {historyVariant.productName} ({historyVariant.name})
                </p>
              </div>
              <button
                onClick={() => setHistoryVariant(null)}
                className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6">
              {selectedHistoryMovements.length === 0 ? (
                <div className="py-12 text-center italic text-slate-400">
                  No stock movements recorded for this item.
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-slate-100 shadow-sm">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead className="border-b border-slate-100 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-4 py-3">When</th>
                        <th className="px-3 py-3 text-right">Change</th>
                        <th className="px-3 py-3 text-right">Before → After</th>
                        <th className="px-3 py-3">Type</th>
                        <th className="px-4 py-3">Reason / Reference</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {selectedHistoryMovements.map((m) => (
                        <tr
                          key={m.id}
                          className="transition hover:bg-slate-50/30"
                        >
                          <td className="whitespace-nowrap px-4 py-3">
                            {new Date(m.createdAt).toLocaleString("en-GB", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-right">
                            <span
                              className={`font-semibold ${
                                m.quantityChange > 0
                                  ? "text-emerald-600"
                                  : "text-rose-600"
                              }`}
                            >
                              {m.quantityChange > 0 ? "+" : ""}
                              {m.quantityChange.toString()}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-right font-mono text-slate-500">
                            {m.stockBefore.toString()} →{" "}
                            {m.stockAfter.toString()}
                          </td>
                          <td className="px-3 py-3 font-semibold text-slate-600">
                            {getMovementTypeLabel(m.movementType)}
                          </td>
                          <td
                            className="max-w-[200px] truncate px-4 py-3 text-slate-500"
                            title={
                              m.reason +
                              (m.orderNumber ? ` • ${m.orderNumber}` : "")
                            }
                          >
                            {m.reason}
                            {m.orderNumber && (
                              <span className="ml-1 inline-flex items-center rounded-full border border-blue-100 bg-blue-50 px-1.5 py-0.5 text-[9px] font-semibold text-blue-700">
                                {m.orderNumber}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex shrink-0 items-center justify-end border-t border-slate-100 bg-slate-50 px-6 py-4">
              <button
                onClick={() => setHistoryVariant(null)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
