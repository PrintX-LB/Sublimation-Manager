import { decimalToCents, centsToMoney } from "@/lib/money";

export type TotalLine = {
  quantity: number;
  unitPrice: string;
  discountType: "fixed" | "percentage";
  discountValue: string;
};

function discountCents(
  subtotal: bigint,
  type: TotalLine["discountType"],
  value: string,
) {
  const amount = decimalToCents(value);
  return type === "percentage" ? (subtotal * amount) / 10000n : amount;
}

export function calculateTotals(
  lines: TotalLine[],
  orderDiscountType: "fixed" | "percentage",
  orderDiscountValue: string,
  deliveryCharge: string,
) {
  const lineTotals = lines.map((line) => {
    const subtotal = decimalToCents(line.unitPrice) * BigInt(line.quantity);
    const discount = discountCents(
      subtotal,
      line.discountType,
      line.discountValue,
    );
    return {
      subtotal,
      discount: discount > subtotal ? subtotal : discount,
      total: subtotal - (discount > subtotal ? subtotal : discount),
    };
  });
  const subtotal = lineTotals.reduce((sum, line) => sum + line.subtotal, 0n);
  const lineDiscount = lineTotals.reduce(
    (sum, line) => sum + line.discount,
    0n,
  );
  const orderDiscountRaw = discountCents(
    subtotal - lineDiscount,
    orderDiscountType,
    orderDiscountValue,
  );
  const orderDiscount =
    orderDiscountRaw > subtotal - lineDiscount
      ? subtotal - lineDiscount
      : orderDiscountRaw;
  const delivery = decimalToCents(deliveryCharge);
  return {
    subtotal: centsToMoney(subtotal),
    lineDiscount: centsToMoney(lineDiscount),
    orderDiscount: centsToMoney(orderDiscount),
    deliveryCharge: centsToMoney(delivery),
    total: centsToMoney(subtotal - lineDiscount - orderDiscount + delivery),
  };
}
