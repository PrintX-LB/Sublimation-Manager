import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileText,
  Mail,
  Package,
  Phone,
  Wallet,
} from "lucide-react";
import { PageHeading } from "@/components/admin/page-heading";
import { BackNavigation } from "@/components/admin/back-navigation";
import { PaymentForm } from "@/components/orders/payment-form";
import { ProductionIncidentButton } from "@/components/admin/production-incident-button";
import { getOrder } from "@/lib/orders/service";
import { ORDER_STATUSES } from "@/lib/orders/status";
import { orderIdSchema } from "@/lib/validation/order";
import { formatUSD } from "@/lib/money";
import { getAdminSession } from "@/lib/admin-session";
import {
  addPaymentAction,
  convertCancelledTestOrderToDraftAction,
  markFullyPaidAction,
  permanentlyDeleteTestOrderAction,
  transitionOrderAction,
  correctMaterialConsumptionAction,
} from "../actions";

const statusProgress = [
  "Draft",
  "Ready to print",
  "In production",
  "Completed",
] as const;

function paymentState(total: number, paid: number) {
  if (paid > total)
    return {
      label: "Overpaid",
      tone: "text-violet-300",
      remaining: paid - total,
      suffix: "over",
    };
  if (paid >= total && total > 0)
    return {
      label: "Paid",
      tone: "text-emerald-300",
      remaining: 0,
      suffix: "",
    };
  if (paid > 0)
    return {
      label: "Partially paid",
      tone: "text-amber-300",
      remaining: total - paid,
      suffix: "left",
    };
  return {
    label: "Unpaid",
    tone: "text-rose-300",
    remaining: total,
    suffix: "left",
  };
}

function fileUrl(value: string) {
  return `/api/local-files?path=${encodeURIComponent(value)}`;
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!orderIdSchema.safeParse(id).success) notFound();
  const order = await getOrder(id);
  if (!order) notFound();
  const admin = await getAdminSession();
  const total = Number(order.total);
  const paid = order.payments.reduce(
    (sum, payment) => sum + Number(payment.amount),
    0,
  );
  const payment = paymentState(total, paid);
  const currentIndex = ORDER_STATUSES.indexOf(
    order.status as (typeof ORDER_STATUSES)[number],
  );
  const nextStatus =
    currentIndex >= 0 && currentIndex < ORDER_STATUSES.length - 1
      ? ORDER_STATUSES[currentIndex + 1]
      : null;
  const artworkReady =
    order.items.length > 0 &&
    order.items.every((item) =>
      Boolean(
        item.printReadyArtworkPath ||
        item.artworkProject?.activeVersionId ||
        item.artworkProject?.versions.length,
      ),
    );
  const reasons = [
    !order.isTestOrder ? "Order is not marked as a test order" : null,
    order.status !== "Draft" ? "Status is not Draft" : null,
    order.payments.length > 0 ? "Payment records exist" : null,
    order.stockCommitted ? "Stock is committed" : null,
    order.stockMovements.length > 0 ||
    order.items.some((item) => item.stockMovements.length > 0)
      ? "Stock movement history exists"
      : null,
  ].filter((reason): reason is string => Boolean(reason));
  const eligible = reasons.length === 0;
  const conversionEligible =
    order.isTestOrder &&
    order.status === "Cancelled" &&
    order.payments.length === 0 &&
    !order.stockCommitted &&
    order.stockMovements.length === 0 &&
    !order.items.some((item) => item.stockMovements.length > 0);
  const timeline = [
    { label: "Order created", date: order.createdAt, icon: FileText },
    ...order.files.map((file) => ({
      label: `Artwork/file uploaded: ${file.originalFilename}`,
      date: file.createdAt,
      icon: FileText,
    })),
    ...order.items.flatMap(
      (item) =>
        item.artworkProject?.versions.map((version) => ({
          label: `Artwork exported · version ${version.version}`,
          date: version.createdAt,
          icon: CheckCircle2,
        })) ?? [],
    ),
    ...order.payments.map((item) => ({
      label: `Payment recorded · ${formatUSD(Number(item.amount))}`,
      date: item.createdAt,
      icon: Wallet,
    })),
    ...order.stockMovements.map((movement) => ({
      label:
        Number(movement.quantityChange) > 0
          ? "Stock restored"
          : "Stock committed",
      date: movement.createdAt,
      icon: Package,
    })),
    {
      label: `Current status: ${order.status}`,
      date: order.updatedAt,
      icon: CheckCircle2,
    },
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <BackNavigation label="Back to Orders" fallbackRoute="/orders" />
      <header className="flex flex-wrap items-start justify-between gap-3">
        <PageHeading
          title={order.orderNumber}
          description={`${order.customer.fullName} · Created ${order.createdAt.toLocaleDateString("en-GB")}${order.dueDate ? ` · Due ${order.dueDate.toLocaleDateString("en-GB")}` : ""}`}
        />
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/orders/${id}/edit`}
            className="rounded-lg border border-slate-700 px-3 py-2 text-sm"
          >
            Edit Order
          </Link>
          <Link
            href={`/orders/${id}/sheet`}
            className="rounded-lg border border-brand-500/40 px-3 py-2 text-sm text-brand-200"
          >
            Create A4 Print Sheet
          </Link>
        </div>
      </header>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <main className="space-y-5">
          <section className="rounded-xl border border-slate-700 bg-slate-900/70 p-5"><h2 className="font-semibold">Print sheets</h2>{order.printSheets.length ? <div className="mt-3 space-y-2">{order.printSheets.map((slot) => <div key={slot.id} className="flex items-center justify-between text-sm"><span>{slot.sheet.filename} · Slot {slot.slotNumber}<span className="ml-2 text-xs text-slate-500">{slot.sheet.createdAt.toLocaleDateString("en-GB")}</span></span><a href={`/api/local-files?path=${encodeURIComponent(slot.sheet.storagePath)}`} download className="text-brand-300">Download</a></div>)}</div> : <p className="mt-2 text-sm text-slate-500">No print sheets generated for this order.</p>}</section>
          <section className="rounded-xl border border-slate-700 bg-slate-900/70 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-brand-200 rounded-full bg-brand-500/15 px-3 py-1 text-xs font-semibold">
                {order.status}
              </span>
              {order.isTestOrder ? (
                <span className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-200">
                  Test Order
                </span>
              ) : null}
              <span
                className={`rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold ${payment.tone}`}
              >
                {payment.label}
              </span>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${artworkReady ? "bg-emerald-500/15 text-emerald-200" : "bg-rose-500/15 text-rose-200"}`}
              >
                {artworkReady ? "Artwork ready" : "Artwork pending"}
              </span>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {statusProgress.map((status, index) => (
                <span
                  key={status}
                  className={`rounded-full border px-2 py-1 text-[11px] ${index <= currentIndex ? "border-brand-400/50 text-brand-200" : "border-slate-700 text-slate-500"}`}
                >
                  {status}
                </span>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-slate-700 bg-slate-900/70 p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Order items & artwork</h2>
              <span className="text-xs text-slate-400">
                {order.items.length} item{order.items.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {order.items.map((item) => {
                const artwork =
                  item.customerArtworkPath || item.artworkProject?.originalPath;
                return (
                  <article
                    key={item.id}
                    className="rounded-lg border border-slate-800 bg-slate-950/40 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="flex min-w-0 gap-3">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-800">
                          {artwork ? (
                          <Image
                            src={fileUrl(artwork)}
                            alt=""
                            width={56}
                            height={56}
                            className="h-full w-full object-cover"
                            />
                          ) : (
                            <Package size={20} className="text-slate-500" />
                          )}
                        </div>
                        <div>
                          <h3 className="font-medium text-slate-100">
                            {item.productNameSnapshot}
                          </h3>
                          <p className="text-sm text-slate-400">
                            {item.description} · SKU {item.skuSnapshot}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {item.quantity} ×{" "}
                            {formatUSD(Number(item.unitPrice))} · Discount{" "}
                            {formatUSD(Number(item.lineDiscountValue))}
                          </p>
                        </div>
                      </div>
                      <p className="font-semibold text-slate-100">
                        {formatUSD(Number(item.lineTotal))}
                      </p>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                      {artwork ? (
                        <span className="text-emerald-300">
                          Original available
                        </span>
                      ) : (
                        <span className="text-amber-300">
                          No artwork uploaded
                        </span>
                      )}
                      <Link
                        href={`/orders/${id}/items/${item.id}/artwork`}
                        className="rounded border border-slate-700 px-2 py-1 text-slate-200"
                      >
                        Open Editor
                      </Link>
                      {item.customerArtworkPath ? (
                        <a
                          href={fileUrl(item.customerArtworkPath)}
                          download
                          className="rounded border border-slate-700 px-2 py-1"
                        >
                          Download original
                        </a>
                      ) : null}
                      {item.printReadyArtworkPath ? (
                        <a
                          href={fileUrl(item.printReadyArtworkPath)}
                          download
                          className="rounded border border-slate-700 px-2 py-1"
                        >
                          Download print-ready
                        </a>
                      ) : null}
                      {item.artworkProject?.versions.length ? (
                        <span className="text-slate-500">
                          {item.artworkProject.versions.length} version
                          {item.artworkProject.versions.length === 1 ? "" : "s"}
                        </span>
                      ) : null}
                      <ProductionIncidentButton
                        orderItemId={item.id}
                        productName={item.productNameSnapshot}
                        wasteOptions={item.productVariant?.productionRecipe?.items.filter((line) => line.materialRole !== "BLANK_PRODUCT").map((line) => ({ inventoryItemId: line.inventoryItemId, name: line.inventoryItem.name, quantity: line.quantity.toString(), unit: line.unit, currentQuantity: line.inventoryItem.currentQuantity.toString() }))}
                        disabledReason={
                          order.status === "Cancelled"
                            ? "Order is cancelled"
                            : order.status === "Completed"
                              ? "Order is completed"
                              : !item.productVariant
                                ? "Product is not linked to inventory"
                                : undefined
                        }
                      />
                    </div>
                    {item.productionAttempts.length ? (
                      <div className="mt-3 border-t border-slate-800 pt-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Production attempts</p>
                        <div className="mt-2 space-y-1">
                          {item.productionAttempts.map((attempt) => {
                            const incident = attempt.failedIncident;
                            return (
                              <div key={attempt.id} className="flex flex-wrap items-center justify-between gap-2 rounded bg-slate-950/50 px-2 py-1.5 text-xs">
                                <span className="text-slate-300">Attempt {attempt.attemptNumber}</span>
                                <span className={attempt.status === "Failed" ? "text-rose-300" : "text-emerald-300"}>{attempt.status}</span>
                                {incident ? <span className="text-slate-500">{incident.reason}</span> : null}
                                <span className="text-slate-500">{attempt.createdAt.toLocaleDateString("en-GB")}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                    {item.productVariant?.productionRecipe ? (
                      <details className="mt-3 border-t border-slate-800 pt-3">
                        <summary className="cursor-pointer text-xs font-semibold text-slate-400">Production recipe materials</summary>
                        <div className="mt-2 space-y-1 text-xs">
                          {item.productVariant.productionRecipe.items.map((line) => {
                            const consumed = item.materialConsumptions.filter((entry) => entry.recipeItemId === line.id).reduce((sum, entry) => sum + Number(entry.quantity), 0);
                            return <div key={line.id} className="flex flex-wrap justify-between gap-2"><span>{line.inventoryItem.name}</span><span className="text-slate-400">{line.quantity.toString()} {line.unit} / unit · {consumed > 0 ? `Consumed ${consumed} ${line.unit}` : `Pending ${line.consumptionStage}`}</span></div>;
                          })}
                          {item.materialConsumptions.map((consumption) => <div key={consumption.id} className="mt-2 rounded bg-slate-950/60 p-2"><div className="flex flex-wrap justify-between gap-2"><span>{consumption.materialNameSnapshot} · {consumption.materialRoleSnapshot}</span><span>{consumption.quantity.toString()} {consumption.unit} · {consumption.status}</span></div><p className="text-slate-500">{consumption.consumptionStage} · Unit cost {formatUSD(Number(consumption.unitCost))} · {consumption.createdAt.toLocaleString("en-GB")}</p>{admin ? <form action={correctMaterialConsumptionAction} className="mt-2 flex flex-wrap gap-1"><input type="hidden" name="consumptionId" value={consumption.id} /><input type="hidden" name="idempotencyKey" value={`correction:${consumption.id}:${order.updatedAt.getTime()}`} /><input name="delta" placeholder="+/- qty" required className="h-7 w-20 rounded border border-slate-700 bg-slate-950 px-1 text-[11px]" /><input name="reason" placeholder="Correction reason" required className="h-7 min-w-32 flex-1 rounded border border-slate-700 bg-slate-950 px-1 text-[11px]" /><button className="h-7 rounded border border-amber-500/50 px-2 text-[11px] text-amber-200">Correct</button></form> : null}</div>)}
                        </div>
                      </details>
                    ) : <p className="mt-3 text-[11px] text-amber-300">No production recipe configured.</p>}
                  </article>
                );
              })}
            </div>
          </section>

          <section className="grid gap-5 md:grid-cols-2">
            <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-5">
              <h2 className="font-semibold">Customer</h2>
              <p className="mt-3 font-medium">{order.customer.fullName}</p>
              <div className="mt-2 space-y-1 text-sm text-slate-400">
                <p>
                  <Phone size={13} className="mr-2 inline" />
                  {order.customer.phone || "No phone"}
                </p>
                <p>
                  <Mail size={13} className="mr-2 inline" />
                  {order.customer.email || "No email"}
                </p>
                <p>
                  {[
                    order.customer.addressLine1,
                    order.customer.addressLine2,
                    order.customer.city,
                    order.customer.postcode,
                    order.customer.country,
                  ]
                    .filter(Boolean)
                    .join(", ") || "No address"}
                </p>
              </div>
              <div className="mt-4 flex gap-2">
                <Link
                  href={`/customers/${order.customer.id}`}
                  className="text-brand-300 text-xs"
                >
                  View customer
                </Link>
                <Link
                  href={`/customers/${order.customer.id}/edit`}
                  className="text-brand-300 text-xs"
                >
                  Edit customer
                </Link>
              </div>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-5">
              <h2 className="font-semibold">Notes & files</h2>
              <p className="mt-3 text-sm text-slate-400">
                {order.customerNotes || "No customer notes."}
              </p>
              <p className="mt-2 text-sm text-slate-400">
                {order.internalNotes || "No internal notes."}
              </p>
              <div className="mt-4 space-y-1">
                {order.files.length ? (
                  order.files.map((file) => (
                    <a
                      key={file.id}
                      href={fileUrl(file.storagePath)}
                      download
                      className="text-brand-300 block truncate text-xs"
                    >
                      <FileText size={13} className="mr-1 inline" />
                      {file.originalFilename}
                    </a>
                  ))
                ) : (
                  <p className="text-xs text-slate-500">No order files.</p>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-700 bg-slate-900/70 p-5">
            <h2 className="font-semibold">Activity timeline</h2>
            <div className="mt-4 space-y-3">
              {timeline.map(({ label, date, icon: Icon }) => (
                <div
                  key={`${label}-${date.toISOString()}`}
                  className="flex gap-3 text-sm"
                >
                  <Icon size={15} className="text-brand-300 mt-0.5" />
                  <div>
                    <p className="text-slate-200">{label}</p>
                    <p className="text-xs text-slate-500">
                      {date.toLocaleString("en-GB")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {admin ? (
            <section className="rounded-xl border border-red-500/30 bg-red-500/10 p-5">
              <h2 className="font-semibold text-red-300">Danger Zone</h2>
              {eligible ? (
                <>
                  <p className="mt-2 text-sm text-red-200">
                    This is an eligible test order. Permanent deletion cannot be
                    undone.
                  </p>
                  <form
                    action={permanentlyDeleteTestOrderAction}
                    autoComplete="off"
                    className="mt-4 flex flex-wrap items-end gap-2"
                  >
                    <div>
                      <label className="block text-xs font-semibold text-red-200">
                        Type {order.orderNumber} to confirm
                      </label>
                      <input
                        name="deleteOrderConfirmation"
                        autoComplete="new-password"
                        autoCorrect="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        required
                        className="mt-1 rounded border border-red-300 bg-transparent px-2 py-1 text-sm"
                      />
                    </div>
                    <input type="hidden" name="orderId" value={order.id} />
                    <button className="rounded bg-red-600 px-3 py-2 text-sm font-semibold text-white">
                      Permanently Delete Test Order
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <p className="mt-2 flex items-center gap-2 font-semibold text-red-200">
                    <AlertTriangle size={16} />
                    Permanent deletion unavailable
                  </p>
                  <ul className="mt-3 space-y-1 text-sm text-red-200">
                    {reasons.map((reason) => (
                      <li key={reason}>• {reason}</li>
                    ))}
                  </ul>
                  {conversionEligible ? (
                    <form
                      action={convertCancelledTestOrderToDraftAction}
                      className="mt-4"
                    >
                      <input type="hidden" name="orderId" value={order.id} />
                      <button className="rounded border border-red-300 px-3 py-2 text-sm font-semibold text-red-200">
                        Convert Cancelled Test Order to Draft
                      </button>
                    </form>
                  ) : null}
                </>
              )}
            </section>
          ) : null}
        </main>

        <aside className="space-y-5 xl:sticky xl:top-5">
          <section className="rounded-xl border border-slate-700 bg-slate-900/70 p-5">
            <h2 className="font-semibold">Production workspace</h2>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Status</span>
                <span className="font-semibold text-slate-100">
                  {order.status}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Artwork</span>
                <span
                  className={
                    artworkReady ? "text-emerald-300" : "text-amber-300"
                  }
                >
                  {artworkReady ? "Ready" : "Pending"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Payment</span>
                <span className={payment.tone}>{payment.label}</span>
              </div>
            </div>
            {nextStatus ? (
              <form action={transitionOrderAction} className="mt-5">
                <input type="hidden" name="id" value={order.id} />
                <input type="hidden" name="status" value={nextStatus} />
                <button className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white">
                  {nextStatus}
                  <ArrowRight size={15} />
                </button>
              </form>
            ) : null}
            <form action={transitionOrderAction} className="mt-5 space-y-2">
              <input type="hidden" name="id" value={order.id} />
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400" htmlFor="order-status">Current status</label>
              <select
                id="order-status"
                name="status"
                defaultValue={order.status}
                className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm"
              >
                <option value="">Change status…</option>
                {ORDER_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
              <button className="h-10 w-full whitespace-nowrap rounded-lg border border-slate-700 px-3 text-sm font-semibold text-slate-100 hover:bg-slate-800">
                Change Status
              </button>
            </form>
          </section>
          <section className="rounded-xl border border-slate-700 bg-slate-900/70 p-5">
            <h2 className="font-semibold">Payment summary</h2>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex min-h-6 items-center justify-between">
                <span className="text-slate-400">Total</span>
                <span>{formatUSD(total)}</span>
              </div>
              <div className="flex min-h-6 items-center justify-between">
                <span className="text-slate-400">Paid</span>
                <span>{formatUSD(paid)}</span>
              </div>
              <div className="flex min-h-6 items-center justify-between">
                <span className="text-slate-400">Remaining</span>
                <span
                  className={
                    payment.remaining ? "text-rose-300" : "text-emerald-300"
                  }
                >
                  {payment.remaining
                    ? `${formatUSD(payment.remaining)} ${payment.suffix}`
                    : "—"}
                </span>
              </div>
            </div>
            <PaymentForm action={addPaymentAction} orderId={order.id} />
            {payment.remaining > 0 ? (
              <form action={markFullyPaidAction} className="mt-2">
                <input type="hidden" name="orderId" value={order.id} />
                <button className="w-full rounded-lg border border-slate-700 px-3 py-2 text-xs">
                  Mark fully paid
                </button>
              </form>
            ) : null}
            <div className="mt-5 border-t border-slate-800 pt-4">
              <h3 className="text-xs font-semibold text-slate-400">
                Payment history
              </h3>
              {order.payments.length ? (
                order.payments.map((item) => (
                  <p
                    key={item.id}
                    className="mt-2 flex items-center justify-between rounded-lg bg-slate-950/60 px-3 py-2 text-xs"
                  >
                    <span>{item.method}</span>
                    <span>{formatUSD(Number(item.amount))}</span>
                  </p>
                ))
              ) : (
                <p className="mt-2 text-xs text-slate-500">
                  No payments recorded.
                </p>
              )}
            </div>
          </section>
          <section className="rounded-xl border border-slate-700 bg-slate-900/70 p-5">
            <h2 className="font-semibold">Order totals</h2>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex min-h-7 items-center justify-between">
                <span className="text-slate-400">Subtotal</span>
                <span>{formatUSD(Number(order.subtotal))}</span>
              </div>
              <div className="flex min-h-7 items-center justify-between">
                <span className="text-slate-400">Delivery</span>
                <span>{formatUSD(Number(order.deliveryCharge))}</span>
              </div>
              <div className="flex min-h-8 items-center justify-between border-t border-slate-800 pt-3 font-semibold">
                <span>Grand total</span>
                <span>{formatUSD(total)}</span>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
