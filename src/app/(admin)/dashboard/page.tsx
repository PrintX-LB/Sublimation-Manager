import { prisma } from "@/lib/db/prisma";
import Link from "next/link";
import {
  ShoppingBag,
  PackageCheck,
  FileSearch,
  AlertTriangle,
  DollarSign,
  TrendingUp,
  PlusCircle,
  Users,
  Package,
  Boxes,
  Image as ImageIcon,
  CheckCircle,
  Activity,
  Coins,
  ChevronRight
} from "lucide-react";
import { PageHeading } from "@/components/admin/page-heading";
import { formatUSD } from "@/lib/money";

export default async function DashboardPage() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // Fetch all orders with items and payments
  const allOrders = await prisma.order.findMany({
    include: {
      payments: { select: { amount: true } },
      customer: { select: { fullName: true } },
      items: {
        select: {
          quantity: true,
          productNameSnapshot: true,
        }
      }
    },
    orderBy: { createdAt: "desc" },
  });

  // KPI Calculations
  const activeOrders = allOrders.filter(
    (o) => !["Cancelled", "Completed"].includes(o.status)
  );
  
  const openOrdersCount = activeOrders.length;
  const readyToPrintCount = allOrders.filter((o) => o.status === "Ready to print").length;
  const awaitingFilesCount = allOrders.filter((o) => o.status === "Draft").length;

  // Fetch low stock items
  const variants = await prisma.productVariant.findMany({
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
      product: { select: { name: true } },
    },
  });

  const lowStockItems = variants.filter((v) => {
    const current = Number(v.stockQuantity);
    const min = Number(v.reorderLevel);
    return current <= min;
  });
  const lowStockCount = lowStockItems.length;

  // Payments and revenue today
  let outstandingBalanceTotal = 0;
  const outstandingPaymentsList: Array<{
    id: string;
    orderNumber: string;
    customerName: string;
    due: number;
  }> = [];

  for (const order of allOrders) {
    if (order.status === "Cancelled") continue;
    const paid = order.payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const total = Number(order.total);
    if (paid < total) {
      const due = total - paid;
      outstandingBalanceTotal += due;
      outstandingPaymentsList.push({
        id: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customer.fullName,
        due,
      });
    }
  }

  const paymentsToday = await prisma.payment.findMany({
    where: {
      createdAt: { gte: todayStart },
    },
    select: { amount: true },
  });
  const revenueToday = paymentsToday.reduce((sum, p) => sum + Number(p.amount), 0);

  // Production Queue: active orders sorted by due date
  const productionQueue = [...activeOrders].sort((a, b) => {
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate.getTime() - b.dueDate.getTime();
  }).slice(0, 6);

  // Recent Orders (last 10)
  const recentOrders = allOrders.slice(0, 10);

  // Fetch recent activity data
  const [recentCustomers, recentPayments, recentMovements] = await Promise.all([
    prisma.customer.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { fullName: true, createdAt: true },
    }),
    prisma.payment.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        order: { select: { orderNumber: true } },
      },
    }),
    prisma.stockMovement.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        productVariant: {
          select: {
            sku: true,
            product: { select: { name: true } },
          },
        },
      },
    }),
  ]);

  // Combine to create custom activity feed
  const activities: Array<{
    id: string;
    type: "customer" | "order" | "payment" | "stock";
    time: Date;
    description: string;
  }> = [];

  recentCustomers.forEach((c) => {
    activities.push({
      id: `cust-${c.fullName}-${c.createdAt.getTime()}`,
      type: "customer",
      time: c.createdAt,
      description: `New customer "${c.fullName}" registered`,
    });
  });

  allOrders.slice(0, 5).forEach((o) => {
    activities.push({
      id: `order-${o.orderNumber}-${o.createdAt.getTime()}`,
      type: "order",
      time: o.createdAt,
      description: `Order ${o.orderNumber} created for ${o.customer.fullName}`,
    });
  });

  recentPayments.forEach((p) => {
    activities.push({
      id: `pay-${p.id}`,
      type: "payment",
      time: p.createdAt,
      description: `Received payment of ${formatUSD(Number(p.amount))} for Order ${p.order.orderNumber}`,
    });
  });

  recentMovements.forEach((m) => {
    const change = Number(m.quantityChange);
    const action = change > 0 ? "added" : "removed";
    activities.push({
      id: `mov-${m.id}`,
      type: "stock",
      time: m.createdAt,
      description: `Stock adjusted: ${Math.abs(change)} units ${action} for ${m.productVariant.product.name} (${m.productVariant.sku})`,
    });
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const sortedActivities = activities
    .sort((a, b) => b.time.getTime() - a.time.getTime())
    .slice(0, 6);

  const formatActivityTime = (date: Date) => {
    const diffMs = new Date().getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit" });
  };

  const getStatusBadgeStyle = (status: string) => {
    switch (status) {
      case "Ready to print":
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
      case "Draft":
        return "bg-amber-500/10 text-amber-400 border-amber-500/20";
      case "Ready to print":
        return "bg-purple-500/10 text-purple-400 border-purple-500/20";
      case "In production":
        return "bg-blue-500/10 text-blue-400 border-blue-500/20";
      case "Draft":
        return "bg-slate-500/10 text-slate-400 border-slate-700";
      case "Cancelled":
        return "bg-red-500/10 text-red-400 border-red-500/20";
      default:
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <PageHeading
        title="Command Center"
        description="PrintX sublimation workspace live overview, queue priority, and inventory threshold monitoring."
      />

      {/* KPI Row (6 columns) */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Link href="/orders" className="group rounded-2xl border border-slate-800 bg-[#1e293b] p-4 shadow-sm hover:border-slate-700 transition duration-150">
          <div className="flex items-center justify-between">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400 group-hover:scale-105 transition-transform duration-150">
              <ShoppingBag size={18} />
            </span>
            <span className="text-[10px] text-slate-400 font-semibold group-hover:text-slate-200 transition-colors">Manage →</span>
          </div>
          <p className="mt-4 text-2xl font-bold text-slate-50">{openOrdersCount}</p>
          <p className="mt-1 text-xs text-slate-500 font-medium">Open Orders</p>
        </Link>

        <Link href="/orders?status=Ready+to+print" className="group rounded-2xl border border-slate-800 bg-[#1e293b] p-4 shadow-sm hover:border-slate-700 transition duration-150">
          <div className="flex items-center justify-between">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 group-hover:scale-105 transition-transform duration-150">
              <PackageCheck size={18} />
            </span>
            <span className="text-[10px] text-slate-400 font-semibold group-hover:text-slate-200 transition-colors">Queue →</span>
          </div>
          <p className="mt-4 text-2xl font-bold text-slate-50">{readyToPrintCount}</p>
          <p className="mt-1 text-xs text-slate-500 font-medium">Ready to Print</p>
        </Link>

        <Link href="/orders?status=Awaiting+customer+files" className="group rounded-2xl border border-slate-800 bg-[#1e293b] p-4 shadow-sm hover:border-slate-700 transition duration-150">
          <div className="flex items-center justify-between">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400 group-hover:scale-105 transition-transform duration-150">
              <FileSearch size={18} />
            </span>
            <span className="text-[10px] text-slate-400 font-semibold group-hover:text-slate-200 transition-colors">Files →</span>
          </div>
          <p className="mt-4 text-2xl font-bold text-slate-50">{awaitingFilesCount}</p>
          <p className="mt-1 text-xs text-slate-500 font-medium">Awaiting Files</p>
        </Link>

        <Link href="/stock?lowStock=true" className="group rounded-2xl border border-slate-800 bg-[#1e293b] p-4 shadow-sm hover:border-slate-700 transition duration-150">
          <div className="flex items-center justify-between">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 group-hover:scale-105 transition-transform duration-150">
              <AlertTriangle size={18} />
            </span>
            <span className="text-[10px] text-slate-400 font-semibold group-hover:text-slate-200 transition-colors">Alerts →</span>
          </div>
          <p className="mt-4 text-2xl font-bold text-amber-400">{lowStockCount}</p>
          <p className="mt-1 text-xs text-slate-500 font-medium">Low Stock</p>
        </Link>

        <Link href="/orders?payment=partial" className="group rounded-2xl border border-slate-800 bg-[#1e293b] p-4 shadow-sm hover:border-slate-700 transition duration-150">
          <div className="flex items-center justify-between">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-500/10 text-red-400 group-hover:scale-105 transition-transform duration-150">
              <DollarSign size={18} />
            </span>
            <span className="text-[10px] text-slate-400 font-semibold group-hover:text-slate-200 transition-colors">Ledger →</span>
          </div>
          <p className="mt-4 text-2xl font-bold text-slate-50">
            {formatUSD(outstandingBalanceTotal)}
          </p>
          <p className="mt-1 text-xs text-slate-500 font-medium">Outstanding Bal.</p>
        </Link>

        <Link href="/orders" className="group rounded-2xl border border-slate-800 bg-[#1e293b] p-4 shadow-sm hover:border-slate-700 transition duration-150">
          <div className="flex items-center justify-between">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 group-hover:scale-105 transition-transform duration-150">
              <TrendingUp size={18} />
            </span>
            <span className="text-[10px] text-slate-400 font-semibold group-hover:text-slate-200 transition-colors">Today</span>
          </div>
          <p className="mt-4 text-2xl font-bold text-slate-50">
            {formatUSD(revenueToday)}
          </p>
          <p className="mt-1 text-xs text-slate-500 font-medium">Revenue Today</p>
        </Link>
      </section>

      {/* Second Row: Production Queue (2/3) and Quick Actions (1/3) */}
      <section className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-[#1e293b] shadow-sm flex flex-col overflow-hidden">
          <div className="border-b border-slate-800 px-6 py-4 flex items-center justify-between bg-slate-900/30">
            <h2 className="font-semibold text-sm tracking-wide text-slate-200 flex items-center gap-2">
              <PackageCheck size={16} className="text-emerald-400" />
              Production Queue
            </h2>
            <Link href="/orders" className="text-xs text-brand-500 hover:text-brand-600 transition-colors">
              View All Orders
            </Link>
          </div>
          <div className="overflow-x-auto flex-1">
            {productionQueue.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center p-12 text-slate-400 h-full">
                <ShoppingBag size={28} className="text-slate-600 mb-2" />
                <p className="text-sm font-semibold text-slate-300">No active production</p>
                <p className="text-xs text-slate-500 mt-1">Create a new order to fill the queue pipeline.</p>
                <Link href="/orders/new" className="mt-4 inline-flex items-center gap-1 text-xs font-semibold bg-brand-600 text-white rounded-lg px-3 py-1.5 hover:bg-brand-700 transition">
                  Create Order
                </Link>
              </div>
            ) : (
              <table className="w-full min-w-[600px] text-left text-xs border-collapse">
                <thead className="bg-slate-900/50 font-bold uppercase text-slate-500 text-[10px] tracking-wider border-b border-slate-800/80">
                  <tr>
                    <th className="px-5 py-3">Order</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">First Product</th>
                    <th className="px-4 py-3 text-right">Items</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-5 py-3">Due Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {productionQueue.map((o) => {
                    const totalQty = o.items.reduce((sum, item) => sum + item.quantity, 0);
                    const mainProduct = o.items[0]?.productNameSnapshot ?? "Unknown Product";
                    const extraItemsCount = o.items.length - 1;

                    return (
                      <tr key={o.id} className="hover:bg-slate-800/40 transition cursor-pointer">
                        <td className="px-5 py-3.5">
                          <Link href={`/orders/${o.id}`} className="font-bold text-slate-50 hover:underline">
                            {o.orderNumber}
                          </Link>
                        </td>
                        <td className="px-4 py-3.5 text-slate-200">{o.customer.fullName}</td>
                        <td className="px-4 py-3.5 text-slate-400">
                          {mainProduct}
                          {extraItemsCount > 0 && (
                            <span className="text-[10px] text-slate-500 font-semibold ml-1">
                              (+{extraItemsCount} more)
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right font-semibold text-slate-300">{totalQty}</td>
                        <td className="px-4 py-3.5 text-center">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold border ${getStatusBadgeStyle(o.status)}`}>
                            {o.status}
                          </span>
                        </td>
                        <td className={`px-5 py-3.5 font-medium ${o.dueDate && o.dueDate.getTime() < Date.now() ? "text-red-400" : "text-slate-400"}`}>
                          {o.dueDate ? o.dueDate.toLocaleDateString("en-GB") : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Quick Actions (1/3) */}
        <div className="rounded-2xl border border-slate-800 bg-[#1e293b] p-5 shadow-sm flex flex-col justify-between">
          <div>
            <h2 className="font-semibold text-sm tracking-wide text-slate-200 flex items-center gap-2 mb-4 border-b border-slate-800 pb-3">
              <Activity size={16} className="text-emerald-400" />
              Quick Operations
            </h2>
            <div className="grid gap-2.5">
              <Link href="/orders/new" className="flex items-center gap-2 justify-between rounded-xl border border-slate-800 hover:border-slate-700 bg-slate-900/30 hover:bg-slate-900/60 p-3 transition text-xs font-semibold text-slate-200">
                <span className="flex items-center gap-2">
                  <PlusCircle size={15} className="text-emerald-400" />
                  New Order
                </span>
                <ChevronRight size={13} className="text-slate-500" />
              </Link>
              <Link href="/customers/new" className="flex items-center gap-2 justify-between rounded-xl border border-slate-800 hover:border-slate-700 bg-slate-900/30 hover:bg-slate-900/60 p-3 transition text-xs font-semibold text-slate-200">
                <span className="flex items-center gap-2">
                  <Users size={15} className="text-blue-400" />
                  New Customer
                </span>
                <ChevronRight size={13} className="text-slate-500" />
              </Link>
              <Link href="/products/new" className="flex items-center gap-2 justify-between rounded-xl border border-slate-800 hover:border-slate-700 bg-slate-900/30 hover:bg-slate-900/60 p-3 transition text-xs font-semibold text-slate-200">
                <span className="flex items-center gap-2">
                  <Package size={15} className="text-purple-400" />
                  New Product
                </span>
                <ChevronRight size={13} className="text-slate-500" />
              </Link>
              <Link href="/stock" className="flex items-center gap-2 justify-between rounded-xl border border-slate-800 hover:border-slate-700 bg-slate-900/30 hover:bg-slate-900/60 p-3 transition text-xs font-semibold text-slate-200">
                <span className="flex items-center gap-2">
                  <Boxes size={15} className="text-amber-400" />
                  Receive Stock
                </span>
                <ChevronRight size={13} className="text-slate-500" />
              </Link>
              <Link href="/orders?status=Design+preparation" className="flex items-center gap-2 justify-between rounded-xl border border-slate-800 hover:border-slate-700 bg-slate-900/30 hover:bg-slate-900/60 p-3 transition text-xs font-semibold text-slate-200">
                <span className="flex items-center gap-2">
                  <ImageIcon size={15} className="text-pink-400" />
                  Open Artwork Queue
                </span>
                <ChevronRight size={13} className="text-slate-500" />
              </Link>
            </div>
          </div>

          {/* Placeholders for future widgets (Subtle/Hidden if not needed, shown as premium upcoming features) */}
          <div className="border border-dashed border-slate-800 rounded-xl p-3 bg-slate-900/10 mt-6 text-center">
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Upcoming Integrations</span>
            <div className="flex gap-1.5 justify-center mt-2 text-[9px] text-slate-500 font-medium">
              <span className="bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">Daily Calendar</span>
              <span className="bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">Printer Link</span>
            </div>
          </div>
        </div>
      </section>

      {/* Third Row: Recent Orders (LEFT) & Low Stock (RIGHT) */}
      <section className="grid gap-6 md:grid-cols-2">
        {/* Recent Orders */}
        <div className="rounded-2xl border border-slate-800 bg-[#1e293b] shadow-sm flex flex-col overflow-hidden">
          <div className="border-b border-slate-800 px-6 py-4 flex items-center justify-between bg-slate-900/30">
            <h2 className="font-semibold text-sm tracking-wide text-slate-200 flex items-center gap-2">
              <ShoppingBag size={16} className="text-blue-400" />
              Recent Orders
            </h2>
          </div>
          <div className="overflow-x-auto">
            {recentOrders.length === 0 ? (
              <div className="text-center text-slate-400 italic py-12 text-xs">No orders recorded yet.</div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-900/50 font-bold uppercase text-slate-500 text-[10px] tracking-wider border-b border-slate-800/80">
                  <tr>
                    <th className="px-5 py-3">Order</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-5 py-3 text-right">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {recentOrders.map((o) => (
                    <tr key={o.id} className="hover:bg-slate-800/40 transition">
                      <td className="px-5 py-3">
                        <Link href={`/orders/${o.id}`} className="font-bold text-slate-100 hover:underline">
                          {o.orderNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-300">{o.customer.fullName}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-semibold border ${getStatusBadgeStyle(o.status)}`}>
                          {o.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-100">
                        {formatUSD(Number(o.total))}
                      </td>
                      <td className="px-5 py-3 text-right text-slate-500">
                        {formatActivityTime(o.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Low Stock Alerts */}
        <div className="rounded-2xl border border-slate-800 bg-[#1e293b] shadow-sm flex flex-col overflow-hidden">
          <div className="border-b border-slate-800 px-6 py-4 flex items-center justify-between bg-slate-900/30">
            <h2 className="font-semibold text-sm tracking-wide text-slate-200 flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-400" />
              Low Stock Alerts
            </h2>
            <Link href="/stock" className="text-xs text-brand-500 hover:text-brand-600 transition-colors">
              Stock Manager
            </Link>
          </div>
          <div className="overflow-y-auto max-h-[300px]">
            {lowStockItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center p-12 text-slate-400 h-full">
                <CheckCircle size={28} className="text-emerald-500/80 mb-2" />
                <p className="text-sm font-semibold text-slate-300">All levels healthy</p>
                <p className="text-xs text-slate-500 mt-1">No items currently below minimum stock levels.</p>
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-900/50 font-bold uppercase text-slate-500 text-[10px] tracking-wider border-b border-slate-800/80">
                  <tr>
                    <th className="px-5 py-3">Product Variant</th>
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3 text-right">Current Stock</th>
                    <th className="px-5 py-3 text-right">Min Threshold</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {lowStockItems.slice(0, 8).map((item) => (
                    <tr key={item.id} className="hover:bg-slate-800/40 transition">
                      <td className="px-5 py-3">
                        <div className="font-semibold text-slate-100">{item.product.name}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">{item.name}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-[10px] text-slate-400">{item.sku}</td>
                      <td className={`px-4 py-3 text-right font-bold ${Number(item.stockQuantity) <= 0 ? "text-red-500" : "text-amber-500"}`}>
                        {item.stockQuantity.toString()}
                      </td>
                      <td className="px-5 py-3 text-right text-slate-500">{item.reorderLevel.toString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </section>

      {/* Fourth Row: Outstanding Payments Ledger */}
      {/* TODO: The Live Activity Log widget will return in a future version as the Production Feed after the Activity/Audit system is implemented. */}
      <section className="grid gap-6 grid-cols-1">
        {/* Outstanding Payments Ledger */}
        <div className="rounded-2xl border border-slate-800 bg-[#1e293b] shadow-sm flex flex-col overflow-hidden">
          <div className="border-b border-slate-800 px-6 py-4 flex items-center justify-between bg-slate-900/30">
            <h2 className="font-semibold text-sm tracking-wide text-slate-200 flex items-center gap-2">
              <Coins size={16} className="text-red-400" />
              Outstanding Payments
            </h2>
            <Link href="/orders?payment=partial" className="text-xs text-brand-500 hover:text-brand-600 transition-colors">
              Payment Ledger
            </Link>
          </div>
          <div className="overflow-y-auto max-h-[300px]">
            {outstandingPaymentsList.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center p-12 text-slate-400 h-full">
                <CheckCircle size={28} className="text-emerald-500/80 mb-2" />
                <p className="text-sm font-semibold text-slate-300">All balances paid</p>
                <p className="text-xs text-slate-500 mt-1">There are no outstanding client balances.</p>
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-900/50 font-bold uppercase text-slate-500 text-[10px] tracking-wider border-b border-slate-800/80">
                  <tr>
                    <th className="px-5 py-3">Customer</th>
                    <th className="px-4 py-3">Order Number</th>
                    <th className="px-5 py-3 text-right">Amount Due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {outstandingPaymentsList.slice(0, 8).map((pay) => (
                    <tr key={pay.id} className="hover:bg-slate-800/40 transition">
                      <td className="px-5 py-3 font-semibold text-slate-200">{pay.customerName}</td>
                      <td className="px-4 py-3 font-mono text-[10px]">
                        <Link href={`/orders/${pay.id}`} className="font-bold text-slate-100 hover:underline">
                          {pay.orderNumber}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-right font-bold text-red-400">
                        {formatUSD(pay.due)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
