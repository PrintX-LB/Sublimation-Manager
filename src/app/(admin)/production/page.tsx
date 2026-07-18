import Link from "next/link";
import { ArrowRight, FileText } from "lucide-react";
import { PageHeading } from "@/components/admin/page-heading";
import { ProductionIncidentButton } from "@/components/admin/production-incident-button";
import { prisma } from "@/lib/db/prisma";
import { formatUSD } from "@/lib/money";
import {
  PRODUCTION_COLUMNS,
  groupProductionOrders,
  sortProductionOrders,
} from "@/lib/production-board";
import { ORDER_STATUSES } from "@/lib/orders/status";
import {
  transitionOrderAction,
  updateOrderPriorityAction,
} from "../orders/actions";
import { orderItemReference } from "@/lib/orders/item-reference";

export const dynamic = "force-dynamic";

export default async function ProductionPage() {
  const orders = await prisma.order.findMany({
    where: { status: { in: [...PRODUCTION_COLUMNS] } },
    include: {
      customer: { select: { fullName: true } },
      payments: { select: { amount: true } },
      items: {
        include: {
          productVariant: { select: { stockQuantity: true, stockPerUnit: true } },
          artworkProject: {
            select: {
              activeVersionId: true,
              versions: { select: { id: true } },
            },
          },
          printSheetSlots: { include: { sheet: { select: { id: true, sheetNumber: true, status: true } } } },
          productionAttempts: { where: { status: { in: ["Ready to Print", "In production"] } }, orderBy: { attemptNumber: "desc" }, take: 1, select: { attemptNumber: true, status: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  const groups = groupProductionOrders(sortProductionOrders(orders));
  const now = new Date();
  const dueToday = orders.filter(
    (order) => order.dueDate?.toDateString() === now.toDateString(),
  ).length;
  const overdue = orders.filter(
    (order) => order.dueDate && order.dueDate < now,
  ).length;
  const count = (status: string) =>
    orders.filter((order) => order.status === status).length;
  const summaries = [
    ["Active orders", orders.length],
    ["Due today", dueToday],
    ["Overdue", overdue],
    ["Ready to print", count("Ready to print")],
    ["In production", count("In production")],
    ["Completed", count("Completed")],
  ] as const;
  return (
    <div className="mx-auto max-w-[1600px] space-y-5">
      <PageHeading
        title="Production Board"
        description="A live workshop view of active orders."
      />
      <div className="flex flex-wrap gap-2"><Link href="/production/recipes" className="inline-flex rounded border border-slate-700 px-3 py-2 text-xs text-brand-200">Production Recipes</Link><Link href="/production/sheets" className="inline-flex rounded border border-slate-700 px-3 py-2 text-xs text-brand-200">Print Sheets</Link></div>
      <section className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/60 p-2">
        {summaries.map(([label, value]) => (
          <div
            key={label}
            className="min-w-[110px] flex-1 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2"
          >
            <p className="text-xs text-slate-400">{label}</p>
            <p className="mt-0.5 text-xl font-semibold text-slate-100">
              {value}
            </p>
          </div>
        ))}
      </section>
      <div className="overflow-x-auto pb-3">
        <div className="grid min-w-[960px] grid-cols-3 gap-4">
          {PRODUCTION_COLUMNS.map((status) => (
            <section
              key={status}
              className="flex min-h-[300px] flex-col rounded-xl border border-slate-700 bg-slate-950/50"
            >
              <header className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
                <h2 className="text-sm font-semibold text-slate-200">
                  {status}
                </h2>
                <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
                  {groups[status].length}
                </span>
              </header>
              <div className="flex-1 space-y-3 overflow-y-auto p-3">
                {groups[status].length ? (
                    groups[status].map((order) => (
                    <CompactProductionCard key={order.id} order={order} now={now} />
                  ))
                ) : (
                  <p className="py-10 text-center text-xs text-slate-500">
                    No orders here
                  </p>
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

type BoardOrder = Awaited<ReturnType<typeof prisma.order.findMany>>[number] & {
  customer: { fullName: string };
  payments: { amount: unknown }[];
  items: Array<{
    id: string;
    itemSequence: number;
    quantity: number;
    productNameSnapshot: string;
    customerArtworkPath: string | null;
    printReadyArtworkPath: string | null;
    productVariant: { stockQuantity: unknown; stockPerUnit: unknown } | null;
    artworkProject: {
      activeVersionId: string | null;
      versions: { id: string }[];
    } | null;
    printSheetSlots: { sheet: { id: string; sheetNumber: string | null; status: string } }[];
    productionAttempts: { attemptNumber: number; status: string }[];
  }>;
};

function CompactProductionCard({ order, now }: { order: BoardOrder; now: Date }) {
  const paid = order.payments.reduce(
    (sum, payment) => sum + Number(payment.amount),
    0,
  );
  const total = Number(order.total);
  const overdue = Boolean(order.dueDate && order.dueDate < now);
  const artworkReady =
    order.items.length > 0 &&
    order.items.every((item) =>
      Boolean(
        item.printReadyArtworkPath ||
        item.artworkProject?.activeVersionId ||
        item.artworkProject?.versions.length,
      ),
    );
  const lowStock = order.items.some(
    (item) =>
      item.productVariant &&
      Number(item.productVariant.stockQuantity) <
        item.quantity * Number(item.productVariant.stockPerUnit),
  );
  const index = PRODUCTION_COLUMNS.indexOf(
    order.status as (typeof PRODUCTION_COLUMNS)[number],
  );
  const next = index >= 0 ? PRODUCTION_COLUMNS[index + 1] : undefined;
  return (
    <article
      className={`rounded-lg border bg-slate-900 p-2.5 ${order.priority === "Urgent" ? "border-amber-400/70" : "border-slate-700"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/orders/${order.id}`}
          className="text-brand-200 font-semibold hover:underline"
        >
          {order.orderNumber}
        </Link>
        <div className="flex items-center gap-1 text-[10px]">
          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-400">{order.priority === "Urgent" ? "Urgent" : "Normal"}</span>
          {overdue ? <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-rose-300">Overdue</span> : order.dueDate ? <span className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-400">Due {order.dueDate.toLocaleDateString("en-GB")}</span> : null}
        </div>
      </div>
      <p className="mt-1 truncate text-sm text-slate-300">
        {order.customer.fullName}
      </p>
      {order.items.length === 1 ? (
        <p className="mt-1.5 truncate text-xs text-slate-300" title={order.items[0]?.productNameSnapshot}>
          {orderItemReference(order.orderNumber, order.items[0]!.itemSequence)} · {order.items[0]!.productNameSnapshot} ×{order.items[0]!.quantity}
        </p>
      ) : (
        <div className="mt-1.5">
          <p className="text-xs text-slate-300">{order.items.length} items · {order.items.reduce((sum, item) => sum + item.quantity, 0)} units</p>
          <div className="mt-1 space-y-1">
            {order.items.map((item) => <p key={item.id} className="truncate text-[11px] text-slate-400" title={item.productNameSnapshot}>{orderItemReference(order.orderNumber, item.itemSequence)} · {item.productNameSnapshot} ×{item.quantity}</p>)}
          </div>
        </div>
      )}
      {order.items.some((item) => item.productionAttempts.length) ? <p className="mt-1 text-[10px] text-slate-500">{order.items.every((item) => item.productionAttempts[0]?.status === order.items[0]?.productionAttempts[0]?.status) ? `Attempt ${order.items.find((item) => item.productionAttempts.length)?.productionAttempts[0]?.attemptNumber} · ${order.items.find((item) => item.productionAttempts.length)?.productionAttempts[0]?.status}` : "Item attempts differ"}</p> : null}
      <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
        {overdue ? (
          <span className="rounded bg-rose-500/15 px-2 py-1 text-rose-300">
            Overdue
          </span>
        ) : order.dueDate?.toDateString() === now.toDateString() ? (
          <span className="rounded bg-amber-500/15 px-2 py-1 text-amber-300">
            Due today
          </span>
        ) : null}
        <span
          className={`rounded px-2 py-1 ${artworkReady ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}
        >
          {artworkReady ? "Artwork ready" : "Artwork missing"}
        </span>
        {paid < total ? (
          <span className="rounded bg-rose-500/15 px-2 py-1 text-rose-300">
            Outstanding {formatUSD(total - paid)}
          </span>
        ) : (
          <span className="rounded bg-emerald-500/15 px-2 py-1 text-emerald-300">
            Paid
          </span>
        )}
        {lowStock ? (
          <span className="rounded bg-orange-500/15 px-2 py-1 text-orange-300">
            Low stock
          </span>
        ) : null}
        {order.customerNotes || order.internalNotes ? (
          <FileText size={13} aria-label="Notes" />
        ) : null}
      </div>
      {order.items.some((item) => item.printSheetSlots.length) ? <p className="mt-2 text-xs text-sky-300">Sheet {order.items.find((item) => item.printSheetSlots.length)?.printSheetSlots[0]?.sheet.sheetNumber ?? "linked"} · {order.items.find((item) => item.printSheetSlots.length)?.printSheetSlots[0]?.sheet.status.replaceAll("_", " ")}</p> : null}
      <div className="mt-2 flex flex-wrap gap-1">
        <Link
          href={`/orders/${order.id}#payments`}
          className="rounded border border-slate-700 px-2 py-1 text-[11px]"
        >
          Record payment
        </Link>
        {next ? (
          <form action={transitionOrderAction}>
            <input type="hidden" name="id" value={order.id} />
            <input type="hidden" name="status" value={next} />
            <button className="flex items-center gap-1 rounded bg-brand-600 px-2 py-1 text-[11px]">
              Next <ArrowRight size={12} />
            </button>
          </form>
        ) : null}
        <form action={transitionOrderAction} className="flex items-center gap-1">
          <input type="hidden" name="id" value={order.id} />
          <select name="status" defaultValue={order.status} aria-label="Change status" className="max-w-[115px] rounded border border-slate-700 bg-slate-950 px-1 py-1 text-[11px]">
            {ORDER_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
          <button className="rounded border border-slate-700 px-2 py-1 text-[11px]">Change</button>
        </form>
        <ProductionIncidentButton
          items={order.items.map((item) => ({
            orderItemId: item.id,
            productName: item.productNameSnapshot,
            itemReference: orderItemReference(order.orderNumber, item.itemSequence),
            disabledReason: order.status === "Completed" ? "Order is completed" : item.productVariant ? undefined : "Product is not linked to inventory",
          }))}
        />
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-slate-800 pt-2">
        <form action={updateOrderPriorityAction}>
          <input type="hidden" name="id" value={order.id} />
          <select
            name="priority"
            defaultValue={order.priority}
            aria-label="Priority"
            className="rounded border border-slate-700 bg-slate-950 px-1 py-1 text-[11px]"
          >
            <option>Normal</option>
            <option>Urgent</option>
          </select>
          <button className="text-[10px] text-brand-300">Set</button>
        </form>
        <span className="text-[10px] text-slate-500">{order.status}</span>
      </div>
    </article>
  );
}
