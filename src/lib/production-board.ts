export const PRODUCTION_COLUMNS = [
  "Ready to print",
  "In production",
  "Completed",
] as const;

export type ProductionColumn = (typeof PRODUCTION_COLUMNS)[number];

export function groupProductionOrders<T extends { status: string }>(orders: T[]) {
  return PRODUCTION_COLUMNS.reduce<Record<ProductionColumn, T[]>>((groups, status) => {
    groups[status] = orders.filter((order) => order.status === status);
    return groups;
  }, {} as Record<ProductionColumn, T[]>);
}

export function sortProductionOrders<T extends { orderNumber: string }>(orders: T[]) {
  return [...orders].sort((a, b) => a.orderNumber.localeCompare(b.orderNumber));
}
