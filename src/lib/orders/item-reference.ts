/** Stable production reference for one line within an order. */
export function orderItemReference(orderNumber: string, itemSequence: number): string {
  return `${orderNumber}_${itemSequence}`;
}

export function productionAttemptReference(
  orderNumber: string,
  itemSequence: number,
  attemptNumber: number,
): string {
  return `${orderItemReference(orderNumber, itemSequence)} · Attempt ${attemptNumber}`;
}
