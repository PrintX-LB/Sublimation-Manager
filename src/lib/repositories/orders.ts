import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { decimalToCents } from "@/lib/money";

export async function listOrders({
  search,
  status,
  payment,
  from,
  to,
  page,
}: {
  search: string;
  status: string;
  payment: string;
  from?: string;
  to?: string;
  page: number;
}) {
  let paymentIds: string[] | undefined;
  if (payment && payment !== "all") {
    const having =
      payment === "unpaid"
        ? Prisma.sql`COALESCE(SUM(p.amount), 0) <= 0`
        : payment === "partial"
          ? Prisma.sql`COALESCE(SUM(p.amount), 0) > 0 AND COALESCE(SUM(p.amount), 0) < o.total`
          : Prisma.sql`COALESCE(SUM(p.amount), 0) >= o.total`;
    const rows = await prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT o.id FROM "Order" o LEFT JOIN "Payment" p ON p.orderId = o.id GROUP BY o.id HAVING ${having}`,
    );
    paymentIds = rows.map((row) => row.id);
  }
  const where = {
    ...(search
      ? {
          OR: [
            { orderNumber: { contains: search } },
            { customer: { fullName: { contains: search } } },
          ],
        }
      : {}),
    ...(status && status !== "all" ? { status } : {}),
    ...(paymentIds ? { id: { in: paymentIds } } : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
            ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
          },
        }
      : {}),
  };
  const [orders, total] = await prisma.$transaction([
    prisma.order.findMany({
      where,
      include: {
        customer: true,
        payments: true,
        items: {
          select: {
            id: true,
            quantity: true,
            stockMovements: { select: { id: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * 20,
      take: 20,
    }),
    prisma.order.count({ where }),
  ]);
  return { orders, total, pageCount: Math.max(1, Math.ceil(total / 20)) };
}

export function paymentState(
  total: string,
  payments: Array<{ amount: { toString(): string } }>,
) {
  const paid = payments.reduce(
    (sum, payment) => sum + decimalToCents(payment.amount.toString()),
    0n,
  );
  const target = decimalToCents(total);
  if (paid <= 0n) return "unpaid";
  if (paid < target) return "partial";
  if (paid > target) return "overpaid";
  return "paid";
}

export async function getOrderStats() {
  const allOrders = await prisma.order.findMany({
    include: {
      payments: {
        select: {
          amount: true,
        },
      },
    },
  });

  const openStatuses = [
    "Draft",
    "Awaiting customer files",
    "Design preparation",
    "Awaiting customer approval",
    "Approved",
    "Ready to print",
    "In production",
    "Ready for collection",
    "Shipped",
  ];

  const openOrdersCount = allOrders.filter((o) => openStatuses.includes(o.status)).length;
  const awaitingApprovalCount = allOrders.filter((o) => o.status === "Awaiting customer approval").length;
  const readyToPrintCount = allOrders.filter((o) => o.status === "Ready to print").length;

  let outstandingBalance = 0;
  for (const order of allOrders) {
    if (order.status === "Cancelled") continue;
    const paid = order.payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const total = Number(order.total);
    if (paid < total) {
      outstandingBalance += (total - paid);
    }
  }

  return {
    openOrders: openOrdersCount,
    awaitingCustomerApproval: awaitingApprovalCount,
    readyToPrint: readyToPrintCount,
    outstandingBalance,
  };
}
