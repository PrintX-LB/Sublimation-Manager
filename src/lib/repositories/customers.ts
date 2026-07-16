import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { CustomerInput } from "@/lib/validation/customer";

const PAGE_SIZE = 10;
export type CustomerSort = "name" | "totalSpent" | "lastOrder" | "number" | "created" | "newest" | "oldest";

export async function listCustomers({
  search,
  sort,
  status = "active",
  minOrders = 0,
  page,
}: {
  search: string;
  sort: string;
  status?: string;
  minOrders?: number;
  page: number;
}) {
  const where: Prisma.CustomerWhereInput = {
    ...(status === "active" ? { isArchived: false } : {}),
    ...(status === "archived" ? { isArchived: true } : {}),
    ...(search
      ? {
          OR: [
            { fullName: { contains: search } },
            { customerNumber: { contains: search } },
            { phone: { contains: search } },
            { email: { contains: search } },
          ],
        }
      : {}),
  };

  // Fetch all customers matching criteria with their orders
  const customers = await prisma.customer.findMany({
    where,
    include: {
      orders: {
        select: {
          total: true,
          status: true,
          createdAt: true,
        },
      },
    },
  });

  // Calculate computed properties
  const enriched = customers.map((c) => {
    const completedOrders = c.orders.filter((o) => o.status === "Completed");
    const completedOrdersCount = completedOrders.length;
    const totalSpent = c.orders.reduce((sum, o) => sum + Number(o.total), 0);
    let lastOrder = null;
    if (c.orders.length > 0) {
      lastOrder = c.orders[0];
      for (let i = 1; i < c.orders.length; i++) {
        const order = c.orders[i];
        if (order && lastOrder && order.createdAt > lastOrder.createdAt) {
          lastOrder = order;
        }
      }
    }

    return {
      ...c,
      completedOrdersCount,
      totalSpent,
      lastOrderDate: lastOrder ? lastOrder.createdAt : null,
      ordersCount: c.orders.length,
    };
  });

  // Filter by min completed orders
  const filtered = enriched.filter((c) => c.completedOrdersCount >= minOrders);

  // Sort
  filtered.sort((a, b) => {
    switch (sort) {
      case "name":
        return a.fullName.localeCompare(b.fullName);
      case "totalSpent":
        return b.totalSpent - a.totalSpent;
      case "lastOrder": {
        const timeA = a.lastOrderDate ? a.lastOrderDate.getTime() : 0;
        const timeB = b.lastOrderDate ? b.lastOrderDate.getTime() : 0;
        return timeB - timeA;
      }
      case "number":
        return a.customerNumber.localeCompare(b.customerNumber);
      case "created":
      case "newest":
        return b.createdAt.getTime() - a.createdAt.getTime();
      case "oldest":
        return a.createdAt.getTime() - b.createdAt.getTime();
      default:
        return 0;
    }
  });

  // Paginate
  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const startIndex = (page - 1) * PAGE_SIZE;
  const paginatedCustomers = filtered.slice(startIndex, startIndex + PAGE_SIZE);

  return {
    customers: paginatedCustomers,
    total,
    pageSize: PAGE_SIZE,
    pageCount,
  };
}

export async function getCustomerStats() {
  const [activeCount, allCustomers] = await prisma.$transaction([
    prisma.customer.count({ where: { isArchived: false } }),
    prisma.customer.findMany({
      include: {
        orders: {
          select: {
            total: true,
            status: true,
          },
        },
      },
    }),
  ]);

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const newCustomersThisMonth = allCustomers.filter(
    (c) => !c.isArchived && c.createdAt >= startOfMonth
  ).length;

  const returningCustomers = allCustomers.filter(
    (c) => !c.isArchived && c.orders.filter((o) => o.status === "Completed").length >= 2
  ).length;

  const completedOrders = await prisma.order.findMany({
    where: { status: "Completed" },
    select: { total: true },
  });
  const lifetimeRevenue = completedOrders.reduce((sum, o) => sum + Number(o.total), 0);

  return {
    totalCustomers: activeCount,
    newCustomersThisMonth,
    returningCustomers,
    lifetimeRevenue,
  };
}

export function getCustomer(id: string) {
  return prisma.customer.findUnique({
    where: { id },
    include: { orders: { orderBy: { createdAt: "desc" }, take: 20 } },
  });
}

export async function createCustomer(input: CustomerInput) {
  return prisma.$transaction(async (tx) => {
    const sequence = await tx.sequence.upsert({
      where: { key: "customer" },
      update: { value: { increment: 1 } },
      create: { key: "customer", value: 1 },
    });
    return tx.customer.create({
      data: {
        ...input,
        customerNumber: `CUS-${sequence.value.toString().padStart(6, "0")}`,
      },
    });
  });
}

export function updateCustomer(id: string, input: CustomerInput) {
  return prisma.customer.update({ where: { id }, data: input });
}

export function archiveCustomer(id: string) {
  return prisma.customer.update({
    where: { id },
    data: { isArchived: true, archivedAt: new Date() },
  });
}
