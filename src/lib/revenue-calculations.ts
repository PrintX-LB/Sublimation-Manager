import { Decimal } from "@prisma/client/runtime/library";

export interface OrderWithRelations {
  id: string;
  orderNumber: string;
  status: string;
  total: Decimal;
  subtotal: Decimal;
  createdAt: Date;
  customer: {
    fullName: string;
  };
  items: Array<{
    id: string;
    quantity: number;
    productionCostSnapshot: Decimal;
    lineTotal: Decimal;
    productNameSnapshot: string;
  }>;
  payments: Array<{
    amount: Decimal;
    createdAt: Date;
  }>;
}

export interface PaymentWithRelations {
  id: string;
  amount: Decimal;
  method: string;
  createdAt: Date;
  order: {
    orderNumber: string;
    customer: {
      fullName: string;
    };
  };
}

export function isRecognizedOrder(order: Pick<OrderWithRelations, "status" | "id">, allPayments: Record<string, number>) {
  const status = order.status.toLowerCase();
  if (status === "cancelled") return false;
  if (status === "draft" && (allPayments[order.id] ?? 0) <= 0) return false;
  return true;
}

export function calculateRevenueStats(
  orders: OrderWithRelations[],
  paymentsInPeriod: PaymentWithRelations[],
  allPaymentsForPeriodOrders: Record<string, number>
) {
  let orderRevenue = 0;
  let estimatedCost = 0;
  let outstandingBalance = 0;
  let completedOrdersCount = 0;

  for (const order of orders) {
    const normalizedStatus = order.status.toLowerCase();
    if (!isRecognizedOrder(order, allPaymentsForPeriodOrders)) {
      continue;
    }

    const orderTotal = Number(order.total);
    orderRevenue += orderTotal;

    if (normalizedStatus === "completed") {
      completedOrdersCount++;
    }

    // Calculate historical cost from snapshots
    let orderCost = 0;
    for (const item of order.items) {
      orderCost += item.quantity * Number(item.productionCostSnapshot);
    }
    estimatedCost += orderCost;

    // Calculate outstanding unpaid balance
    const totalPaid = allPaymentsForPeriodOrders[order.id] ?? 0;
    if (totalPaid < orderTotal) {
      outstandingBalance += (orderTotal - totalPaid);
    }
  }

  // Collected revenue: sum of payments received inside the date range
  const collectedRevenue = paymentsInPeriod.reduce((sum, p) => sum + Number(p.amount), 0);

  // Profit: Order Revenue - Costs
  const estimatedProfit = orderRevenue - estimatedCost;
  const recognizedOrders = orders.filter((order) => isRecognizedOrder(order, allPaymentsForPeriodOrders));

  return {
    orderRevenue,
    collectedRevenue,
    outstandingBalance,
    estimatedCost,
    estimatedProfit,
    completedOrdersCount,
    averageOrderValue: recognizedOrders.length ? orderRevenue / recognizedOrders.length : 0,
  };
}
