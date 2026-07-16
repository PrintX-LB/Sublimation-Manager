"use client";

import { useActionState, useState, useEffect } from "react";
import Link from "next/link";
import { initialFormState, type FormState } from "@/lib/forms/state";
import { CustomerPicker } from "@/components/orders/customer-picker";
import { DatePicker } from "@/components/orders/date-picker";
import { formatUSD } from "@/lib/money";
import {
  Plus,
  Trash2,
  Upload,
  Image as ImageIcon,
  Compass,
  FileText
} from "lucide-react";

type Customer = {
  id: string;
  customerNumber: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postcode: string | null;
  country: string | null;
  previousOrdersCount: number;
  outstandingBalance: number;
};

type Variant = {
  id: string;
  name: string;
  sellingPrice: number;
  productionCost: number;
  categoryName: string;
  product: { name: string };
};

interface FormItem {
  variantId: string;
  quantity: number;
  discountType: "fixed" | "percentage";
  discountValue: string;
  localArtworkUrl?: string;
  localArtworkName?: string;
}

export function OrderForm({
  action,
  customers,
  variants,
  defaultCustomerId,
  initialOrder,
}: {
  action: (state: FormState, data: FormData) => Promise<FormState>;
  customers: Customer[];
  variants: Variant[];
  defaultCustomerId?: string;
  initialOrder?: { dueDate?: string; deliveryMethod?: string | null; deliveryCharge?: string; discountType?: "fixed" | "percentage"; discountValue?: string; customerNotes?: string | null; internalNotes?: string | null; isTestOrder?: boolean; items: FormItem[] };
}) {
  const [state, formAction, pending] = useActionState(action, initialFormState);

  // Unsaved changes confirmation dialog
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "You have unsaved changes. Are you sure you want to leave?";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  // Focus and scroll on validation failure
  useEffect(() => {
    if (state.fieldErrors && Object.keys(state.fieldErrors).length > 0) {
      const firstErrorKey = Object.keys(state.fieldErrors)[0];
      if (firstErrorKey) {
        let element = document.getElementsByName(firstErrorKey)[0] || 
                      document.getElementById(firstErrorKey);
        
        if (!element) {
          element = document.querySelector(`[data-field="${firstErrorKey}"]`) as HTMLElement;
        }

        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
          (element as HTMLElement).focus();
        }
      }
    }
  }, [state]);

  // Form states
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(() => customers.find((customer) => customer.id === defaultCustomerId) ?? null);
  const [items, setItems] = useState<FormItem[]>([
    initialOrder?.items[0] ?? { variantId: variants[0]?.id ?? "", quantity: 1, discountType: "fixed", discountValue: "0" },
  ]);
  const [deliveryMethod, setDeliveryMethod] = useState(initialOrder?.deliveryMethod ?? "Collection");
  const [deliveryCharge, setDeliveryCharge] = useState(initialOrder?.deliveryCharge ?? "0");
  const [discountType, setDiscountType] = useState<"fixed" | "percentage">(initialOrder?.discountType ?? "fixed");
  const [discountValue, setDiscountValue] = useState(initialOrder?.discountValue ?? "0");
  const [amountPaid, setAmountPaid] = useState("0");

  // Group variants by category for option groups
  const groupedVariants: Record<string, Variant[]> = {};
  variants.forEach((v) => {
    const cat = v.categoryName;
    if (!groupedVariants[cat]) groupedVariants[cat] = [];
    groupedVariants[cat].push(v);
  });

  // Calculate live summary totals
  let productsSubtotal = 0;
  let estimatedCostTotal = 0;

  items.forEach((item) => {
    const variant = variants.find((v) => v.id === item.variantId);
    if (!variant) return;

    const unitPrice = variant.sellingPrice;
    let lineTotal = unitPrice * item.quantity;
    const itemDiscount = parseFloat(item.discountValue) || 0;

    if (item.discountType === "percentage") {
      lineTotal = lineTotal - (lineTotal * (itemDiscount / 100));
    } else {
      lineTotal = Math.max(0, lineTotal - itemDiscount);
    }

    productsSubtotal += lineTotal;
    estimatedCostTotal += variant.productionCost * item.quantity;
  });

  // Apply order-level discount
  const orderDiscount = parseFloat(discountValue) || 0;
  let discountSubtracted = 0;
  if (discountType === "percentage") {
    discountSubtracted = productsSubtotal * (orderDiscount / 100);
  } else {
    discountSubtracted = orderDiscount;
  }

  const shipping = parseFloat(deliveryCharge) || 0;
  const grandTotal = Math.max(0, productsSubtotal - discountSubtracted + shipping);
  const paid = parseFloat(amountPaid) || 0;
  const remainingBalance = Math.max(0, grandTotal - paid);
  const estimatedProfit = Math.max(0, grandTotal - estimatedCostTotal);

  const handleArtworkUpload = (index: number, file: File | null) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setItems((cur) =>
      cur.map((item, i) =>
        i === index ? { ...item, localArtworkUrl: url, localArtworkName: file.name } : item
      )
    );
    setIsDirty(true);
  };

  return (
    <form action={formAction} onSubmit={() => setIsDirty(false)} className="mt-6">
      {/* Hidden inputs to feed FormData correctly */}
      <input type="hidden" name="items" value={JSON.stringify(items.map(item => ({
        variantId: item.variantId,
        quantity: item.quantity,
        discountType: item.discountType,
        discountValue: item.discountValue
      })))} />
      <input type="hidden" name="customerId" value={selectedCustomer?.id ?? ""} />

      <div className="grid gap-6 lg:grid-cols-3 items-start">
        {/* Main Columns: Left (2/3 width) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Section 1: Customer Details */}
          <section className="rounded-2xl border border-slate-800 bg-[#1e293b] p-5 shadow-sm space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200 border-b border-slate-800 pb-3 flex items-center gap-2">
              <Plus size={16} className="text-emerald-500" />
              1. Customer & Order Details
            </h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2" id="customerId" tabIndex={-1}>
                <label className="mb-1.5 block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Customer Lookup
                </label>
                <CustomerPicker
                  customers={customers}
                  defaultCustomerId={defaultCustomerId}
                  onChange={(c) => {
                    setSelectedCustomer(c as Customer | null);
                    setIsDirty(true);
                  }}
                />
                {state.fieldErrors?.customerId && (
                  <p className="mt-1.5 text-xs font-semibold text-red-400">
                    {state.fieldErrors.customerId[0]}
                  </p>
                )}
              </div>

              {/* Selected Customer Card */}
              {selectedCustomer && (
                <div className="sm:col-span-2 rounded-xl border border-slate-800 bg-[#0f172a]/40 p-4 grid gap-3 sm:grid-cols-3 text-xs text-slate-300">
                  <div>
                    <span className="block text-[10px] text-slate-500 uppercase tracking-wider font-bold">Client Name</span>
                    <span className="font-bold text-slate-200 block mt-1">{selectedCustomer.fullName}</span>
                    <span className="text-[10px] text-slate-500 bg-slate-800 rounded px-1.5 py-0.5 mt-1 inline-block font-mono">
                      {selectedCustomer.customerNumber}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-500 uppercase tracking-wider font-bold">Contact</span>
                    <span className="block mt-1 truncate">{selectedCustomer.email || "No email"}</span>
                    <span className="block text-slate-400 font-mono mt-0.5">{selectedCustomer.phone || "No phone"}</span>
                  </div>
                  <div className="border-t sm:border-t-0 sm:border-l border-slate-800/80 sm:pl-4 space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Orders completed:</span>
                      <span className="font-bold text-slate-200">{selectedCustomer.previousOrdersCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Outstanding Bal.:</span>
                      <span className={`font-bold ${selectedCustomer.outstandingBalance > 0 ? "text-red-400" : "text-slate-400"}`}>
                        {formatUSD(selectedCustomer.outstandingBalance)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div id="dueDate" tabIndex={-1}>
                <label className="mb-1.5 block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Due date
                </label>
                <DatePicker name="dueDate" defaultValue={initialOrder?.dueDate ?? ""} />
                {state.fieldErrors?.dueDate && (
                  <p className="mt-1.5 text-xs font-semibold text-red-400">
                    {state.fieldErrors.dueDate[0]}
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Delivery Method
                </label>
                <select
                  name="deliveryMethod"
                  value={deliveryMethod}
                  onChange={(e) => {
                    setDeliveryMethod(e.target.value);
                    setIsDirty(true);
                  }}
                  className="w-full rounded-xl border border-slate-800 bg-[#0f172a] px-3.5 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-brand-500 transition"
                >
                  <option value="Collection">Collection</option>
                  <option value="Courier">Courier</option>
                  <option value="Local Delivery">Local Delivery</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
          </section>

          {/* Section 2: Products & Artwork */}
          <section className="rounded-2xl border border-slate-800 bg-[#1e293b] p-5 shadow-sm space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200 flex items-center gap-2">
                  <Compass size={16} className="text-emerald-500" />
                  2. Products & Artwork
                </h2>
                <span className="text-[10px] text-slate-500 block mt-1">
                  Artwork editing becomes available after the order is saved as a draft.
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setItems((cur) => [
                    ...cur,
                    {
                      variantId: variants[0]?.id ?? "",
                      quantity: 1,
                      discountType: "fixed",
                      discountValue: "0",
                    },
                  ]);
                  setIsDirty(true);
                }}
                className="inline-flex items-center gap-1 text-xs font-semibold bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-lg px-2.5 py-1.5 transition"
              >
                <Plus size={13} />
                Add Item
              </button>
            </div>

            {/* List of item cards */}
            <div className="space-y-4">
              {items.map((item, index) => {
                const variant = variants.find((v) => v.id === item.variantId);
                const unitPrice = variant?.sellingPrice ?? 0;
                let lineTotal = unitPrice * item.quantity;
                const itemDiscount = parseFloat(item.discountValue) || 0;

                if (item.discountType === "percentage") {
                  lineTotal = lineTotal - (lineTotal * (itemDiscount / 100));
                } else {
                  lineTotal = Math.max(0, lineTotal - itemDiscount);
                }

                return (
                  <div
                    key={index}
                    className="rounded-xl border border-slate-800 bg-[#0f172a]/30 p-4 space-y-4 shadow-sm"
                  >
                    {/* Header: Product Select + Remove Button */}
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex-1 min-w-[200px]">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                          Product Variant Group
                        </label>
                        <select
                          value={item.variantId}
                          data-field={`items.${index}.variantId`}
                          onChange={(e) => {
                            setItems((cur) =>
                              cur.map((x, i) =>
                                i === index ? { ...x, variantId: e.target.value } : x
                              )
                            );
                            setIsDirty(true);
                          }}
                          className="w-full rounded-lg border border-slate-800 bg-[#0f172a] px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-brand-500"
                        >
                          <option value="">Select Product...</option>
                          {Object.entries(groupedVariants).map(([cat, list]) => (
                            <optgroup key={cat} label={cat}>
                              {list.map((v) => (
                                <option key={v.id} value={v.id}>
                                  {v.product.name} · {v.name} ({formatUSD(v.sellingPrice)})
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                        {state.fieldErrors?.[`items.${index}.variantId`] && (
                          <p className="mt-1 text-[11px] font-semibold text-red-400">
                            {state.fieldErrors[`items.${index}.variantId`]?.[0]}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={items.length === 1}
                        onClick={() => {
                          setItems((cur) => cur.filter((_, i) => i !== index));
                          setIsDirty(true);
                        }}
                        className="text-slate-500 hover:text-red-400 p-2 rounded hover:bg-slate-800/40 disabled:opacity-30 transition mt-4"
                        title="Remove product"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    {/* Show placeholder if variant is not selected, otherwise show calculations & artwork */}
                    {!variant ? (
                      <div className="text-center py-6 text-xs text-slate-500 italic border border-dashed border-slate-800 rounded-xl">
                        Please select a product variant above to configure pricing and upload artwork.
                      </div>
                    ) : (
                      <>
                        {/* Quantity, Discount, Price, and Line Total */}
                        <div className="grid gap-3 sm:grid-cols-4 text-xs">
                          <div>
                            <span className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Selling Price</span>
                            <span className="block py-2 font-mono text-slate-300">
                              {formatUSD(unitPrice)}
                            </span>
                          </div>
                          <div>
                            <span className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Quantity</span>
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              data-field={`items.${index}.quantity`}
                              onChange={(e) => {
                                setItems((cur) =>
                                  cur.map((x, i) =>
                                    i === index ? { ...x, quantity: Math.max(1, parseInt(e.target.value) || 1) } : x
                                  )
                                );
                                setIsDirty(true);
                              }}
                              className="w-full rounded-lg border border-slate-800 bg-[#0f172a] px-2 py-1.5 text-slate-200 focus:outline-none focus:ring-1 focus:ring-brand-500"
                            />
                            {state.fieldErrors?.[`items.${index}.quantity`] && (
                              <p className="mt-1 text-[10px] font-semibold text-red-400">
                                {state.fieldErrors[`items.${index}.quantity`]?.[0]}
                              </p>
                            )}
                          </div>
                          <div>
                            <span className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Line Discount</span>
                            <div className="flex rounded-lg border border-slate-800 bg-[#0f172a] overflow-hidden">
                              <input
                                value={item.discountValue}
                                data-field={`items.${index}.discountValue`}
                                onChange={(e) => {
                                  setItems((cur) =>
                                    cur.map((x, i) =>
                                      i === index ? { ...x, discountValue: e.target.value } : x
                                    )
                                  );
                                  setIsDirty(true);
                                }}
                                className="w-full bg-transparent px-2 py-1.5 text-slate-200 focus:outline-none"
                              />
                              <select
                                value={item.discountType}
                                onChange={(e) => {
                                  setItems((cur) =>
                                    cur.map((x, i) =>
                                      i === index ? { ...x, discountType: e.target.value as "fixed" | "percentage" } : x
                                    )
                                  );
                                  setIsDirty(true);
                                }}
                                className="bg-[#1e293b] border-l border-slate-800 text-[10px] px-1 text-slate-300 focus:outline-none"
                              >
                                <option value="fixed">$</option>
                                <option value="percentage">%</option>
                              </select>
                            </div>
                            {state.fieldErrors?.[`items.${index}.discountValue`] && (
                              <p className="mt-1 text-[10px] font-semibold text-red-400">
                                {state.fieldErrors[`items.${index}.discountValue`]?.[0]}
                              </p>
                            )}
                          </div>
                          <div>
                            <span className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Line Subtotal</span>
                            <span className="block py-2 font-bold text-slate-100 text-right pr-2">
                              {formatUSD(lineTotal)}
                            </span>
                          </div>
                        </div>

                        {/* Artwork Subpanel */}
                        <div className="border-t border-slate-800/80 pt-3 flex flex-wrap gap-4 items-center justify-between">
                          {/* Left: Thumbnail & Name */}
                          <div className="flex items-center gap-3">
                            <div className="h-12 w-12 rounded bg-slate-900 border border-slate-800 flex items-center justify-center overflow-hidden shrink-0">
                              {item.localArtworkUrl ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img src={item.localArtworkUrl} alt="Preview" className="h-full w-full object-cover" />
                              ) : (
                                <ImageIcon size={18} className="text-slate-700" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Artwork Preview</span>
                              <span className="text-xs text-slate-300 font-semibold truncate block max-w-[150px]">
                                {item.localArtworkName || "No file uploaded"}
                              </span>
                            </div>
                          </div>

                          {/* Right: Actions and Badge */}
                          <div className="flex items-center gap-3">
                            {/* Status Badge */}
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                              item.localArtworkUrl
                                ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                : "bg-slate-800 text-slate-500 border-slate-700"
                            }`}>
                              {item.localArtworkUrl ? "Will be saved with order" : "Pending Upload"}
                            </span>

                            {/* File Upload Selector */}
                            <label className="cursor-pointer inline-flex items-center gap-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-slate-100 px-2 py-1 text-[10px] font-semibold transition select-none">
                              <Upload size={11} />
                              Browse
                              <input
                                type="file"
                                name={`artwork-${index}`}
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => handleArtworkUpload(index, e.target.files?.[0] ?? null)}
                              />
                            </label>

                            {/* Editor Canvas Button with Tooltip */}
                            <div className="relative group">
                              <button
                                type="button"
                                disabled
                                className="inline-flex items-center gap-1 rounded bg-[#0f172a] border border-slate-800 text-slate-500 px-2 py-1 text-[10px] font-semibold select-none cursor-not-allowed transition"
                              >
                                Save Draft to Edit Artwork
                              </button>
                              <div className="pointer-events-none absolute bottom-full right-0 mb-2 w-48 rounded bg-slate-950 p-2 text-[9px] font-normal leading-relaxed text-slate-400 border border-slate-800 shadow-md opacity-0 group-hover:opacity-100 transition duration-150 z-50">
                                Save the order first so the artwork can be linked to a permanent order item.
                              </div>
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Notes Section */}
          <section className="rounded-2xl border border-slate-800 bg-[#1e293b] p-5 shadow-sm grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Customer Notes
              </label>
              <textarea
                name="customerNotes"
                defaultValue={initialOrder?.customerNotes ?? ""}
                rows={3}
                placeholder="Special specifications printed on delivery note..."
                className="w-full rounded-xl border border-slate-800 bg-[#0f172a] px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-brand-500 transition"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Internal Studio Notes
              </label>
              <textarea
                name="internalNotes"
                defaultValue={initialOrder?.internalNotes ?? ""}
                rows={3}
                placeholder="Workflow details, heat press temperatures, printer setups..."
                className="w-full rounded-xl border border-slate-800 bg-[#0f172a] px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-brand-500 transition"
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-400 sm:col-span-2"><input type="checkbox" name="isTestOrder" className="size-4"/> Mark as test order (eligible for admin deletion when no payments or stock history exist)</label>
          </section>
        </div>

        {/* Sidebar Sticky Column: Right (1/3 width) */}
        <div className="lg:sticky lg:top-6 space-y-6">
          <section className="rounded-2xl border border-slate-800 bg-[#1e293b] p-5 shadow-sm space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200 border-b border-slate-800 pb-3 flex items-center gap-2">
              <FileText size={16} className="text-emerald-500" />
              3. Order Summary
            </h2>

            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-300">Grand Total</p>
              <p className="mt-1 text-3xl font-bold tracking-tight text-slate-50 text-right">{formatUSD(grandTotal)}</p>
            </div>

            <div className="border-t border-slate-800 pt-4">
              <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Payment</h3>
              <div className="flex items-center justify-between gap-3 text-xs text-slate-400">
                <span>Deposit</span>
                <input
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(e.target.value)}
                  className="h-10 w-28 rounded-lg border border-slate-800 bg-[#0f172a] px-3 text-right text-base font-semibold text-slate-200"
                />
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-3 text-sm font-semibold">
                <span className="text-slate-300">Remaining Balance</span>
                <span className={remainingBalance > 0 ? "text-red-400 text-lg font-bold" : "text-emerald-400 text-lg font-bold"}>
                  {formatUSD(remainingBalance)}
                </span>
              </div>
            </div>

            <div className="border-t border-slate-800 pt-4">
              <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Pricing Breakdown</h3>
              <div className="space-y-3 text-xs text-slate-400">
                <div className="flex items-center justify-between"><span>Products Subtotal</span><span className="text-right font-semibold text-slate-200">{formatUSD(productsSubtotal)}</span></div>
                <div className="flex items-center justify-between gap-3"><span>Delivery</span>
                  <input name="deliveryCharge" value={deliveryCharge} onChange={(e) => setDeliveryCharge(e.target.value)} className="h-9 w-28 rounded-lg border border-slate-800 bg-[#0f172a] px-3 text-right font-semibold text-slate-200" />
                </div>
                <div className="flex items-center justify-between gap-3"><span>Discount</span>
                <div className="flex rounded border border-slate-800 bg-[#0f172a] overflow-hidden">
                  <input
                    name="discountValue"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    className="h-9 w-20 bg-transparent px-2 text-right text-slate-200 focus:outline-none"
                  />
                  <select
                    name="discountType"
                    value={discountType}
                    onChange={(e) => setDiscountType(e.target.value as "fixed" | "percentage")}
                    className="h-9 bg-[#111827] px-2 text-[10px] text-slate-400 border-l border-slate-800 focus:outline-none"
                  >
                    <option value="fixed">$</option>
                    <option value="percentage">%</option>
                  </select>
                </div>
              </div>
                <div className="flex items-center justify-between"><span>Estimated Cost</span><span className="text-right font-semibold text-slate-300">{formatUSD(estimatedCostTotal)}</span></div>
              </div>
            </div>

            <div className="border-t border-slate-800 pt-4">
              <div className="flex items-center justify-between text-sm font-semibold text-emerald-400">
                <span>Estimated Net Profit</span>
                <span className="text-right text-lg">{formatUSD(estimatedProfit)}</span>
              </div>
            </div>

            {/* Error Message */}
            {state.message && (
              <p role="alert" className="rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 p-3 text-xs font-semibold">
                {state.message}
              </p>
            )}

            <div className="border-t border-slate-800 pt-4">
              <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Actions</h3>
              <div className="space-y-2">
              <button
                disabled={pending || !variants.length}
                className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 text-slate-50 font-bold py-3 text-xs tracking-wider uppercase transition shadow-md disabled:opacity-40 select-none"
              >
                Create Order
              </button>
              <button
                disabled={pending || !variants.length}
                className="w-full rounded-xl border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300 font-bold py-2.5 text-xs tracking-wider uppercase transition disabled:opacity-40 select-none"
              >
                Save Draft
              </button>
              <Link
                href="/orders"
                className="block text-center w-full rounded-xl hover:bg-slate-800/40 text-slate-500 hover:text-slate-400 font-bold py-2 text-xs transition select-none"
              >
                Cancel
              </Link>
              </div>
            </div>
          </section>
        </div>
      </div>
    </form>
  );
}
