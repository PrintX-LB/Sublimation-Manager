import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { calculateRevenueStats, OrderWithRelations, PaymentWithRelations } from "./revenue-calculations";

const d = (val: number) => new Decimal(val);

describe("calculateRevenueStats", () => {
  it("excludes cancelled and draft orders from revenue, profit, and counts", () => {
    const orders: OrderWithRelations[] = [
      {
        id: "ord-1",
        orderNumber: "ORD-001",
        status: "Completed",
        total: d(100),
        subtotal: d(100),
        createdAt: new Date(),
        customer: { fullName: "Alice" },
        items: [
          {
            id: "item-1",
            quantity: 2,
            productionCostSnapshot: d(20),
            lineTotal: d(100),
            productNameSnapshot: "Shirt"
          }
        ],
        payments: []
      },
      {
        id: "ord-2",
        orderNumber: "ORD-002",
        status: "Cancelled",
        total: d(150),
        subtotal: d(150),
        createdAt: new Date(),
        customer: { fullName: "Bob" },
        items: [
          {
            id: "item-2",
            quantity: 1,
            productionCostSnapshot: d(50),
            lineTotal: d(150),
            productNameSnapshot: "Cup"
          }
        ],
        payments: []
      },
      {
        id: "ord-3",
        orderNumber: "ORD-003",
        status: "Draft",
        total: d(200),
        subtotal: d(200),
        createdAt: new Date(),
        customer: { fullName: "Charlie" },
        items: [
          {
            id: "item-3",
            quantity: 1,
            productionCostSnapshot: d(100),
            lineTotal: d(200),
            productNameSnapshot: "Cap"
          }
        ],
        payments: []
      }
    ];

    const payments: PaymentWithRelations[] = [];
    const allPayments: Record<string, number> = {};

    const stats = calculateRevenueStats(orders, payments, allPayments);

    expect(stats.orderRevenue).toBe(100); // Only ORD-001 is included
    expect(stats.estimatedCost).toBe(40); // 2 * 20
    expect(stats.estimatedProfit).toBe(60); // 100 - 40
    expect(stats.completedOrdersCount).toBe(1);
  });

  it("calculates collected payment totals correctly from the period's payments", () => {
    const orders: OrderWithRelations[] = [];
    const payments: PaymentWithRelations[] = [
      {
        id: "pay-1",
        amount: d(50),
        method: "Cash",
        createdAt: new Date(),
        order: { orderNumber: "ORD-001", customer: { fullName: "Alice" } }
      },
      {
        id: "pay-2",
        amount: d(30),
        method: "Card",
        createdAt: new Date(),
        order: { orderNumber: "ORD-002", customer: { fullName: "Bob" } }
      }
    ];
    const allPayments: Record<string, number> = {};

    const stats = calculateRevenueStats(orders, payments, allPayments);

    expect(stats.collectedRevenue).toBe(80);
  });

  it("calculates outstanding balances correctly based on historical total payments", () => {
    const orders: OrderWithRelations[] = [
      {
        id: "ord-1",
        orderNumber: "ORD-001",
        status: "In Production",
        total: d(100),
        subtotal: d(100),
        createdAt: new Date(),
        customer: { fullName: "Alice" },
        items: [
          {
            id: "item-1",
            quantity: 1,
            productionCostSnapshot: d(30),
            lineTotal: d(100),
            productNameSnapshot: "Shirt"
          }
        ],
        payments: []
      }
    ];
    const payments: PaymentWithRelations[] = [];
    const allPayments: Record<string, number> = {
      "ord-1": 40 // Paid 40, leaving 60 outstanding
    };

    const stats = calculateRevenueStats(orders, payments, allPayments);

    expect(stats.orderRevenue).toBe(100);
    expect(stats.outstandingBalance).toBe(60);
  });

  it("uses the historical price and cost snapshots rather than current variant prices", () => {
    const orders: OrderWithRelations[] = [
      {
        id: "ord-1",
        orderNumber: "ORD-001",
        status: "Completed",
        total: d(80), // sold for 80 total
        subtotal: d(80),
        createdAt: new Date(),
        customer: { fullName: "Alice" },
        items: [
          {
            id: "item-1",
            quantity: 2,
            productionCostSnapshot: d(15), // historical cost was 15 (current variant price is irrelevant)
            lineTotal: d(80),
            productNameSnapshot: "Mug"
          }
        ],
        payments: []
      }
    ];
    const payments: PaymentWithRelations[] = [];
    const allPayments: Record<string, number> = { "ord-1": 80 };

    const stats = calculateRevenueStats(orders, payments, allPayments);

    expect(stats.orderRevenue).toBe(80);
    expect(stats.estimatedCost).toBe(30); // 2 * 15
    expect(stats.estimatedProfit).toBe(50); // 80 - 30
  });
});
