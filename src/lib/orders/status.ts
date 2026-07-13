export const ORDER_STATUSES = [
  "Draft",
  "Ready to print",
  "In production",
  "Completed",
  "Cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const COMMIT_STATUS: OrderStatus = "Ready to print";

export const LEGACY_STATUS_MAP: Record<string, OrderStatus> = {
  "Awaiting customer files": "Draft",
  "Design preparation": "Draft",
  "Awaiting customer approval": "Draft",
  Approved: "Ready to print",
  "Ready for collection": "Completed",
  Shipped: "Completed",
  Delivered: "Completed",
};

export function normalizeOrderStatus(value: string): OrderStatus | null {
  if ((ORDER_STATUSES as readonly string[]).includes(value)) return value as OrderStatus;
  return LEGACY_STATUS_MAP[value] ?? null;
}

export function isOrderStatus(value: string): value is OrderStatus {
  return normalizeOrderStatus(value) !== null;
}
