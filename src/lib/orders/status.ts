export const ORDER_STATUSES = [
  "Draft",
  "Awaiting customer files",
  "Design preparation",
  "Awaiting customer approval",
  "Approved",
  "Ready to print",
  "In production",
  "Completed",
  "Ready for collection",
  "Shipped",
  "Delivered",
  "Cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const COMMIT_STATUS: OrderStatus = "Approved";

export function isOrderStatus(value: string): value is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(value);
}
