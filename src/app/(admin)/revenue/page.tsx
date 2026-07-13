import { prisma } from "@/lib/db/prisma";
import { PageHeading } from "@/components/admin/page-heading";
import { RevenueDashboard } from "@/components/revenue/revenue-dashboard";
import { calculateRevenueStats, OrderWithRelations, PaymentWithRelations } from "@/lib/revenue-calculations";

export default async function RevenuePage({
  searchParams,
}: {
  searchParams: Promise<{
    year?: string;
    month?: string;
    startDate?: string;
    endDate?: string;
  }>;
}) {
  const params = await searchParams;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const selectedYear = params.year ? parseInt(params.year) : currentYear;
  const selectedMonth = params.month ? (params.month === "all" ? "all" : parseInt(params.month)) : currentMonth;

  let startDate: Date;
  let endDate: Date;

  if (params.startDate && params.endDate) {
    startDate = new Date(params.startDate);
    startDate.setHours(0, 0, 0, 0);
    endDate = new Date(params.endDate);
    endDate.setHours(23, 59, 59, 999);
  } else if (selectedMonth === "all") {
    startDate = new Date(selectedYear, 0, 1, 0, 0, 0, 0);
    endDate = new Date(selectedYear, 11, 31, 23, 59, 59, 999);
  } else {
    startDate = new Date(selectedYear, selectedMonth - 1, 1, 0, 0, 0, 0);
    endDate = new Date(selectedYear, selectedMonth, 0, 23, 59, 59, 999);
  }

  // 1. Fetch valid orders in the range
  const orders = await prisma.order.findMany({
    where: {
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    include: {
      customer: { select: { fullName: true } },
      items: {
        select: {
          id: true,
          quantity: true,
          productionCostSnapshot: true,
          lineTotal: true,
          productNameSnapshot: true,
        },
      },
      payments: {
        select: {
          amount: true,
          createdAt: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  // 2. Fetch payments received in the range
  const paymentsInPeriod = await prisma.payment.findMany({
    where: {
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    include: {
      order: {
        select: {
          orderNumber: true,
          customer: { select: { fullName: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // 3. Fetch yearly orders to calculate year KPI card
  const yearStart = new Date(selectedYear, 0, 1, 0, 0, 0, 0);
  const yearEnd = new Date(selectedYear, 11, 31, 23, 59, 59, 999);
  const yearOrders = await prisma.order.findMany({
    where: {
      createdAt: {
        gte: yearStart,
        lte: yearEnd,
      },
      status: {
        notIn: ["Draft", "draft", "Cancelled", "cancelled"],
      },
    },
    select: { total: true },
  });
  const revenueThisYear = yearOrders.reduce((sum, o) => sum + Number(o.total), 0);

  // 4. Load all historical payments for orders in the selected period to compute exact outstanding balances
  const periodOrderIds = orders.map((o) => o.id);
  const allPaymentsForPeriodOrdersList = await prisma.payment.findMany({
    where: {
      orderId: { in: periodOrderIds },
    },
    select: {
      orderId: true,
      amount: true,
    },
  });

  const allPaymentsForPeriodOrders: Record<string, number> = {};
  allPaymentsForPeriodOrdersList.forEach((p) => {
    allPaymentsForPeriodOrders[p.orderId] = (allPaymentsForPeriodOrders[p.orderId] || 0) + Number(p.amount);
  });

  // Calculate Primary metrics using our unit-tested helper
  const baseStats = calculateRevenueStats(
    orders as unknown as OrderWithRelations[],
    paymentsInPeriod as unknown as PaymentWithRelations[],
    allPaymentsForPeriodOrders
  );

  // 5. Aggregate Top Products
  const productSummary: Record<string, { unitsSold: number; revenue: number; cost: number }> = {};
  orders.forEach((o) => {
    const statusLower = o.status.toLowerCase();
    if (statusLower === "cancelled" || statusLower === "draft") return;

    o.items.forEach((item) => {
      const name = item.productNameSnapshot;
      if (!productSummary[name]) {
        productSummary[name] = { unitsSold: 0, revenue: 0, cost: 0 };
      }
      productSummary[name].unitsSold += item.quantity;
      productSummary[name].revenue += Number(item.lineTotal);
      productSummary[name].cost += item.quantity * Number(item.productionCostSnapshot);
    });
  });

  const topProducts = Object.entries(productSummary)
    .map(([name, val]) => ({
      name,
      unitsSold: val.unitsSold,
      revenue: val.revenue,
      cost: val.cost,
      profit: val.revenue - val.cost,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // 6. Aggregate Top Customers
  const customerSummary: Record<string, { count: number; revenue: number; paid: number }> = {};
  orders.forEach((o) => {
    const statusLower = o.status.toLowerCase();
    if (statusLower === "cancelled" || statusLower === "draft") return;

    const name = o.customer.fullName;
    if (!customerSummary[name]) {
      customerSummary[name] = { count: 0, revenue: 0, paid: 0 };
    }
    customerSummary[name].count += 1;
    customerSummary[name].revenue += Number(o.total);
    customerSummary[name].paid += allPaymentsForPeriodOrders[o.id] || 0;
  });

  const topCustomers = Object.entries(customerSummary)
    .map(([name, val]) => ({
      name,
      ordersCount: val.count,
      revenue: val.revenue,
      paid: val.paid,
      due: Math.max(0, val.revenue - val.paid),
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // 7. Aggregate Order Status Breakdown
  const statusCounts: Record<string, number> = {};
  orders.forEach((o) => {
    const status = o.status;
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  });

  const statusBreakdown = Object.entries(statusCounts).map(([status, count]) => ({
    status,
    count,
  }));

  // 8. Generate Chart Timeline Data
  const chartDataMap: Record<string, { orderRevenue: number; collectedRevenue: number; profit: number }> = {};

  const isMonthlyBreakdown = selectedMonth === "all" || (endDate.getTime() - startDate.getTime() > 31 * 24 * 3600 * 1000);

  if (isMonthlyBreakdown) {
    // Group by month
    for (let m = 0; m < 12; m++) {
      const monthLabel = new Date(selectedYear, m).toLocaleString("en-GB", { month: "short" });
      chartDataMap[monthLabel] = { orderRevenue: 0, collectedRevenue: 0, profit: 0 };
    }

    orders.forEach((o) => {
      const statusLower = o.status.toLowerCase();
      if (statusLower === "cancelled" || statusLower === "draft") return;

      const m = o.createdAt.getMonth();
      const monthLabel = new Date(selectedYear, m).toLocaleString("en-GB", { month: "short" });
      if (chartDataMap[monthLabel]) {
        chartDataMap[monthLabel].orderRevenue += Number(o.total);
        let orderCost = 0;
        o.items.forEach((item) => {
          orderCost += item.quantity * Number(item.productionCostSnapshot);
        });
        chartDataMap[monthLabel].profit += Number(o.total) - orderCost;
      }
    });

    paymentsInPeriod.forEach((p) => {
      const m = p.createdAt.getMonth();
      const monthLabel = new Date(selectedYear, m).toLocaleString("en-GB", { month: "short" });
      if (chartDataMap[monthLabel]) {
        chartDataMap[monthLabel].collectedRevenue += Number(p.amount);
      }
    });
  } else {
    // Group by day of month
    const totalDays = new Date(selectedYear, selectedMonth as number, 0).getDate();
    for (let d = 1; d <= totalDays; d++) {
      const dayLabel = `${d}`;
      chartDataMap[dayLabel] = { orderRevenue: 0, collectedRevenue: 0, profit: 0 };
    }

    orders.forEach((o) => {
      const statusLower = o.status.toLowerCase();
      if (statusLower === "cancelled" || statusLower === "draft") return;

      const dayLabel = `${o.createdAt.getDate()}`;
      if (chartDataMap[dayLabel]) {
        chartDataMap[dayLabel].orderRevenue += Number(o.total);
        let orderCost = 0;
        o.items.forEach((item) => {
          orderCost += item.quantity * Number(item.productionCostSnapshot);
        });
        chartDataMap[dayLabel].profit += Number(o.total) - orderCost;
      }
    });

    paymentsInPeriod.forEach((p) => {
      const dayLabel = `${p.createdAt.getDate()}`;
      if (chartDataMap[dayLabel]) {
        chartDataMap[dayLabel].collectedRevenue += Number(p.amount);
      }
    });
  }

  const chartData = Object.entries(chartDataMap).map(([label, val]) => ({
    label,
    orderRevenue: val.orderRevenue,
    collectedRevenue: val.collectedRevenue,
    profit: val.profit,
  }));

  // Recent payments
  const recentPayments = paymentsInPeriod.slice(0, 15).map((p) => ({
    id: p.id,
    date: p.createdAt.toLocaleDateString("en-GB"),
    customerName: p.order.customer.fullName,
    orderNumber: p.order.orderNumber,
    method: p.method,
    amount: Number(p.amount),
  }));

  // CSV orders data
  const csvOrders = orders.map((o) => {
    const paid = allPaymentsForPeriodOrders[o.id] || 0;
    const total = Number(o.total);
    const due = Math.max(0, total - paid);
    let cost = 0;
    o.items.forEach((item) => {
      cost += item.quantity * Number(item.productionCostSnapshot);
    });

    return {
      date: o.createdAt.toLocaleDateString("en-GB"),
      orderNumber: o.orderNumber,
      customerName: o.customer.fullName,
      status: o.status,
      total,
      paid,
      due,
      cost,
      profit: total - cost,
    };
  });

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageHeading
        title="Revenue Analysis"
        description="Monitor order totals, incoming payments, product profits, outstanding balances, and export audits."
      />
      <RevenueDashboard
        stats={{
          ...baseStats,
          revenueThisYear,
        }}
        filters={{
          year: selectedYear,
          month: selectedMonth,
          startDate: params.startDate || "",
          endDate: params.endDate || "",
        }}
        products={topProducts}
        customers={topCustomers}
        payments={recentPayments}
        chartData={chartData}
        statusBreakdown={statusBreakdown}
        csvOrders={csvOrders}
      />
    </div>
  );
}
