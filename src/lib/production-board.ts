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

export function sortProductionOrders<T extends { priority: string; dueDate: Date | null; createdAt: Date }>(orders: T[], now = new Date()) {
  return [...orders].sort((a, b) => {
    const overdue = (order: T) => order.dueDate !== null && order.dueDate.getTime() < now.getTime();
    if (overdue(a) !== overdue(b)) return overdue(a) ? -1 : 1;
    if ((a.priority === "Urgent") !== (b.priority === "Urgent")) return a.priority === "Urgent" ? -1 : 1;
    if (a.dueDate && b.dueDate && a.dueDate.getTime() !== b.dueDate.getTime()) return a.dueDate.getTime() - b.dueDate.getTime();
    if (a.dueDate !== null && b.dueDate === null) return -1;
    if (a.dueDate === null && b.dueDate !== null) return 1;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}
