import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  ShoppingCart,
  Clock,
  CheckCircle,
  AlertTriangle,
  DollarSign,
} from "lucide-react";
import { PageHeading } from "@/components/admin/page-heading";
import { formatUSD } from "@/lib/money";
import { listOrders, paymentState, getOrderStats } from "@/lib/repositories/orders";
import { ORDER_STATUSES } from "@/lib/orders/status";
import { OrderActionsMenu } from "@/components/orders/order-actions-menu";
import { getAdminSession } from "@/lib/admin-session";

function getStatusBadge(status: string) {
  const styles: Record<string, string> = {
    Draft: "bg-slate-100 text-slate-800 border-slate-200",
    "Awaiting customer files": "bg-blue-50 text-blue-700 border-blue-200",
    "Design preparation": "bg-indigo-50 text-indigo-700 border-indigo-200",
    "Awaiting customer approval": "bg-purple-50 text-purple-700 border-purple-200",
    Approved: "bg-teal-50 text-teal-700 border-teal-200",
    "Ready to print": "bg-pink-50 text-pink-700 border-pink-200",
    "In production": "bg-amber-50 text-amber-700 border-amber-200",
    Completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
    "Ready for collection": "bg-cyan-50 text-cyan-700 border-cyan-200",
    Shipped: "bg-sky-50 text-sky-700 border-sky-200",
    Delivered: "bg-green-50 text-green-700 border-green-200",
    Cancelled: "bg-red-50 text-red-700 border-red-200",
  };
  const style = styles[status] || "bg-slate-100 text-slate-800 border-slate-200";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${style}`}>
      {status}
    </span>
  );
}

function getPaymentBadge(state: string, balance: number) {
  const styles: Record<string, string> = {
    unpaid: "bg-red-50 text-red-700 border-red-200",
    partial: "bg-amber-50 text-amber-700 border-amber-200",
    paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
    overpaid: "bg-purple-50 text-purple-700 border-purple-200",
  };
  const labels: Record<string, string> = {
    unpaid: "Unpaid",
    partial: "Partial",
    paid: "Paid",
    overpaid: "Overpaid",
  };
  const style = styles[state] || "bg-slate-100 text-slate-800 border-slate-200";
  const label = labels[state] || state;
  return (
    <div className="flex flex-col gap-0.5">
      <span className={`inline-flex items-center w-max px-2 py-0.5 rounded-full text-xs font-semibold border ${style}`}>
        {label}
      </span>
      {state !== "paid" && state !== "overpaid" && balance > 0 && (
        <span className="text-[10px] text-slate-500 font-semibold font-mono">
          {formatUSD(balance)} left
        </span>
      )}
      {state === "overpaid" && balance < 0 && (
        <span className="text-[10px] text-purple-600 font-semibold font-mono">
          {formatUSD(Math.abs(balance))} over
        </span>
      )}
    </div>
  );
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const p = await searchParams;
  const search = typeof p.q === "string" ? p.q : "";
  const status = typeof p.status === "string" ? p.status : "all";
  const payment = typeof p.payment === "string" ? p.payment : "all";
  const from = typeof p.from === "string" ? p.from : undefined;
  const to = typeof p.to === "string" ? p.to : undefined;
  const page = Math.max(1, Number(p.page) || 1);

  const result = await listOrders({ search, status, payment, from, to, page });
  const stats = await getOrderStats();
  const adminUnlocked = await getAdminSession();

  const pageHref = (nextPage: number) => {
    const queryParams = new URLSearchParams({
      ...(search ? { q: search } : {}),
      ...(status !== "all" ? { status } : {}),
      ...(payment !== "all" ? { payment } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      page: String(nextPage),
    });
    return `/orders?${queryParams.toString()}`;
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex items-end justify-between gap-4">
        <PageHeading
          title="Orders"
          description="Operational dashboard to track job status, client validation, payment flows, and stock deductions."
        />
        <Link
          href="/orders/new"
          className="rounded-xl bg-brand-600 hover:bg-brand-700 px-4 py-3 text-sm font-semibold text-white shadow-sm transition"
        >
          New order
        </Link>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border bg-white p-5 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Open Orders</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{stats.openOrders}</p>
            <p className="text-xs text-slate-400 mt-1 font-medium">In production pipeline</p>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
            <Clock size={20} />
          </div>
        </div>

        <div className="rounded-xl border bg-white p-5 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Awaiting Approval</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{stats.awaitingCustomerApproval}</p>
            <p className="text-xs text-slate-400 mt-1 font-medium">Pending client check</p>
          </div>
          <div className="p-3 bg-purple-50 text-purple-600 rounded-lg">
            <AlertTriangle size={20} />
          </div>
        </div>

        <div className="rounded-xl border bg-white p-5 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Ready to Print</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{stats.readyToPrint}</p>
            <p className="text-xs text-slate-400 mt-1 font-medium">Approved for sublimation</p>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
            <CheckCircle size={20} />
          </div>
        </div>

        <div className="rounded-xl border bg-white p-5 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Outstanding Balance</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{formatUSD(stats.outstandingBalance)}</p>
            <p className="text-xs text-slate-400 mt-1 font-medium">Unpaid balance total</p>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 rounded-lg">
            <DollarSign size={20} />
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <form className="grid gap-4 rounded-xl border bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-6 items-end">
        <div className="flex flex-col gap-1 lg:col-span-2">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Search</span>
          <div className="relative">
            <Search className="absolute left-3 top-3 text-slate-400" size={16} />
            <input
              name="q"
              defaultValue={search}
              placeholder="Order number or customer name..."
              className="w-full rounded-lg border py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 bg-slate-50 focus:bg-white transition"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</span>
          <select
            name="status"
            defaultValue={status}
            className="rounded-lg border px-3 py-2 text-sm bg-slate-50 focus:outline-none focus:ring-1 focus:ring-brand-500 focus:bg-white transition"
          >
            <option value="all">All statuses</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Payment</span>
          <select
            name="payment"
            defaultValue={payment}
            className="rounded-lg border px-3 py-2 text-sm bg-slate-50 focus:outline-none focus:ring-1 focus:ring-brand-500 focus:bg-white transition"
          >
            <option value="all">All payment states</option>
            <option value="unpaid">Unpaid</option>
            <option value="partial">Partially paid</option>
            <option value="paid">Paid</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">From</span>
          <input
            name="from"
            type="date"
            defaultValue={from}
            className="w-full rounded-lg border px-3 py-1.5 text-sm bg-slate-50 focus:outline-none focus:ring-1 focus:ring-brand-500 focus:bg-white transition"
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">To</span>
          <div>
            <input
              name="to"
              type="date"
              defaultValue={to}
              className="w-full rounded-lg border px-3 py-1.5 text-sm bg-slate-50 focus:outline-none focus:ring-1 focus:ring-brand-500 focus:bg-white transition"
            />
            <div className="hidden">
              <Link
                href="/orders"
                className="rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 transition"
              >
                Reset
              </Link>
              <button className="rounded-lg bg-slate-900 hover:bg-slate-800 px-4 py-2 text-sm font-semibold text-white shadow-sm transition">
                Filter
              </button>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 sm:col-span-2 lg:col-span-6">
          <Link href="/orders" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">Reset</Link>
          <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800">Filter</button>
        </div>
      </form>

      {/* Orders List Container */}
      <section className="relative mt-5 overflow-visible rounded-xl border bg-white shadow-sm">
        {result.orders.length > 0 ? (
          <>
            {/* Desktop Table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead className="bg-slate-50 border-b text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3.5 font-semibold">Order</th>
                    <th className="px-5 py-3.5 font-semibold">Customer</th>
                    <th className="px-5 py-3.5 font-semibold">Order Date</th>
                    <th className="px-5 py-3.5 font-semibold">Due Date</th>
                    <th className="px-5 py-3.5 font-semibold">Status</th>
                    <th className="px-5 py-3.5 font-semibold text-center">Items</th>
                    <th className="px-5 py-3.5 font-semibold text-right">Total</th>
                    <th className="px-5 py-3.5 font-semibold">Payment</th>
                    <th className="px-5 py-3.5 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {result.orders.map((order) => {
                    const state = paymentState(order.total.toString(), order.payments);
                    const paidAmount = order.payments.reduce((sum, p) => sum + Number(p.amount), 0);
                    const balance = Number(order.total) - paidAmount;
                    const totalItems = order.items.reduce((sum, item) => sum + item.quantity, 0);

                    return (
                      <tr key={order.id} className="hover:bg-slate-50/55 transition-colors duration-150">
                        <td className="px-5 py-3">
                          <Link
                            href={`/orders/${order.id}`}
                            className="font-bold text-slate-900 hover:text-brand-600 transition"
                          >
                            {order.orderNumber}
                          </Link>
                          <p className="text-[11px] text-slate-400 font-semibold mt-0.5">
                            {order.createdAt.toLocaleDateString("en-GB")}
                          </p>
                        </td>
                        <td className="px-5 py-3">
                          <span className="font-semibold text-slate-800 block">{order.customer.fullName}</span>
                          {(order.customer.phone || order.customer.email) && (
                            <span className="text-xs text-slate-500 block truncate max-w-[170px] mt-0.5">
                              {order.customer.phone || order.customer.email}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-slate-600">
                          {order.createdAt.toLocaleDateString("en-GB")}
                        </td>
                        <td className="px-5 py-3 text-slate-600 font-medium">
                          {order.dueDate ? order.dueDate.toLocaleDateString("en-GB") : "—"}
                        </td>
                        <td className="px-5 py-3">
                          {getStatusBadge(order.status)}
                        </td>
                        <td className="px-5 py-3 text-center font-mono font-semibold text-slate-600">
                          {totalItems}
                        </td>
                        <td className="px-5 py-3 text-right font-bold text-slate-900">
                          {formatUSD(Number(order.total))}
                        </td>
                        <td className="px-5 py-3">
                          {getPaymentBadge(state, balance)}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <OrderActionsMenu
                            order={{ id: order.id, orderNumber: order.orderNumber, status: order.status, paymentState: state, isTestOrder: order.isTestOrder, stockCommitted: order.stockCommitted, hasStockHistory: order.items.some((item) => item.stockMovements.length > 0) }} adminUnlocked={adminUnlocked}
                            firstItemId={order.items[0]?.id}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile View */}
            <div className="block sm:hidden divide-y divide-slate-100">
              {result.orders.map((order) => {
                const state = paymentState(order.total.toString(), order.payments);
                const paidAmount = order.payments.reduce((sum, p) => sum + Number(p.amount), 0);
                const balance = Number(order.total) - paidAmount;
                const totalItems = order.items.reduce((sum, item) => sum + item.quantity, 0);

                return (
                  <div key={order.id} className="p-4 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Link href={`/orders/${order.id}`} className="font-bold text-slate-900 hover:text-brand-600 transition">
                          {order.orderNumber}
                        </Link>
                        <p className="text-[11px] text-slate-400 font-semibold mt-0.5">
                          {order.createdAt.toLocaleDateString("en-GB")}
                        </p>
                      </div>
                      {getStatusBadge(order.status)}
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 py-2.5 border-t border-b border-slate-100 text-xs">
                      <div>
                        <span className="text-slate-400 block uppercase font-medium tracking-wider">Customer</span>
                        <span className="text-slate-700 block truncate font-semibold">{order.customer.fullName}</span>
                        {(order.customer.phone || order.customer.email) && (
                          <span className="text-slate-500 block truncate text-[10px] mt-0.5">
                            {order.customer.phone || order.customer.email}
                          </span>
                        )}
                      </div>
                      <div>
                        <span className="text-slate-400 block uppercase font-medium tracking-wider">Due Date</span>
                        <span className="text-slate-700 block mt-0.5 font-semibold">
                          {order.dueDate ? order.dueDate.toLocaleDateString("en-GB") : "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block uppercase font-medium tracking-wider">Total</span>
                        <span className="text-slate-900 block font-bold text-sm">{formatUSD(Number(order.total))}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block uppercase font-medium tracking-wider">Payment</span>
                        <div className="mt-0.5">{getPaymentBadge(state, balance)}</div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <div className="text-xs text-slate-500 font-medium">
                        {totalItems} item{totalItems === 1 ? "" : "s"}
                      </div>
                      <OrderActionsMenu
                        order={{ id: order.id, orderNumber: order.orderNumber, status: order.status, paymentState: state, isTestOrder: order.isTestOrder, stockCommitted: order.stockCommitted, hasStockHistory: order.items.some((item) => item.stockMovements.length > 0) }} adminUnlocked={adminUnlocked}
                        firstItemId={order.items[0]?.id}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          /* Empty State */
          <div className="flex flex-col items-center justify-center p-12 text-center bg-white">
            <div className="p-4 bg-slate-50 rounded-full text-slate-400 border border-slate-100">
              <ShoppingCart size={32} />
            </div>
            <h3 className="mt-4 text-lg font-bold text-slate-900">No orders yet</h3>
            <p className="mt-2 text-sm text-slate-500 max-w-sm">
              Create your first order to start tracking customers, production, payments and stock.
            </p>
            <Link
              href="/orders/new"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand-600 hover:bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition"
            >
              <Plus size={16} />
              Create Order
            </Link>
          </div>
        )}
      </section>

      {/* Pagination */}
      <div className="mt-5 flex items-center justify-between text-sm text-slate-500">
        <p>
          {result.total} order{result.total === 1 ? "" : "s"} found
        </p>
        <div className="flex items-center gap-2">
          <Link
            aria-disabled={page <= 1}
            href={pageHref(Math.max(1, page - 1))}
            className={`rounded-lg border p-2 bg-white hover:bg-slate-50 shadow-sm transition ${page <= 1 ? "pointer-events-none opacity-40" : ""}`}
          >
            <ChevronLeft size={18} />
            <span className="sr-only">Previous page</span>
          </Link>
          <span className="font-medium text-slate-700">
            Page {Math.min(page, result.pageCount)} of {result.pageCount}
          </span>
          <Link
            aria-disabled={page >= result.pageCount}
            href={pageHref(Math.min(result.pageCount, page + 1))}
            className={`rounded-lg border p-2 bg-white hover:bg-slate-50 shadow-sm transition ${page >= result.pageCount ? "pointer-events-none opacity-40" : ""}`}
          >
            <ChevronRight size={18} />
            <span className="sr-only">Next page</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
