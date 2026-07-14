import { WorkflowHeader } from "@/components/admin/workflow-header";
import { prisma } from "@/lib/db/prisma";
import { OrderForm } from "@/components/orders/order-form";
import { createOrderAction } from "../actions";

export default async function NewOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string }>;
}) {
  const params = await searchParams;
  const customerId = params.customerId;

  const [rawCustomers, rawVariants] = await prisma.$transaction([
    prisma.customer.findMany({
      where: { isArchived: false },
      select: {
        id: true,
        customerNumber: true,
        fullName: true,
        phone: true,
        email: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        postcode: true,
        country: true,
        orders: {
          where: { status: { not: "Cancelled" } },
          select: {
            total: true,
            payments: {
              select: { amount: true },
            },
          },
        },
      },
      orderBy: { fullName: "asc" },
    }),
    prisma.productVariant.findMany({
      where: { isActive: true, product: { isActive: true } },
      select: {
        id: true,
        sku: true,
        name: true,
        sellingPrice: true,
        productionCost: true,
        product: {
          select: {
            name: true,
            category: { select: { name: true } },
          },
        },
      },
      orderBy: { sku: "asc" },
    }),
  ]);

  // Compute stats and serialize Decimals for the client to prevent hydration issues
  const customers = rawCustomers.map((c) => {
    let outstandingBalance = 0;
    c.orders.forEach((o) => {
      const orderTotal = Number(o.total);
      const paid = o.payments.reduce((sum, p) => sum + Number(p.amount), 0);
      if (paid < orderTotal) {
        outstandingBalance += (orderTotal - paid);
      }
    });

    return {
      id: c.id,
      customerNumber: c.customerNumber,
      fullName: c.fullName,
      phone: c.phone,
      email: c.email,
      addressLine1: c.addressLine1,
      addressLine2: c.addressLine2,
      city: c.city,
      postcode: c.postcode,
      country: c.country,
      previousOrdersCount: c.orders.length,
      outstandingBalance,
    };
  });

  const variants = rawVariants.map((v) => ({
    id: v.id,
    sku: v.sku,
    name: v.name,
    sellingPrice: Number(v.sellingPrice),
    productionCost: Number(v.productionCost),
    categoryName: v.product.category?.name ?? "Uncategorised",
    product: {
      name: v.product.name,
    },
  }));

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <WorkflowHeader
        title="New Order"
        description="Launch a new sublimation job sheet. Draft orders do not commit inventory stock levels."
        backLabel="Back to Orders"
        fallbackRoute="/orders"
      />
      <OrderForm
        action={createOrderAction}
        customers={customers}
        variants={variants}
        defaultCustomerId={customerId}
      />
    </div>
  );
}
