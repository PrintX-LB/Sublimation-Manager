const MONEY_PATTERN = /^\d{1,9}(?:\.\d{1,2})?$/;

export function decimalToCents(value: string) {
  if (!MONEY_PATTERN.test(value))
    throw new Error(
      "Enter a positive amount with no more than two decimal places",
    );
  const [whole = "0", fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

export function centsToMoney(cents: bigint) {
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  return `${negative ? "-" : ""}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, "0")}`;
}

export function unitProfit(sellingPrice: string, productionCost: string) {
  return centsToMoney(
    decimalToCents(sellingPrice) - decimalToCents(productionCost),
  );
}

export function marginPercent(sellingPrice: string, productionCost: string) {
  const selling = decimalToCents(sellingPrice);
  if (selling === 0n) return "0.0";
  const profit = selling - decimalToCents(productionCost);
  const tenths = (profit * 1000n) / selling;
  const absoluteTenths = tenths < 0n ? -tenths : tenths;
  return `${tenths < 0n ? "-" : ""}${absoluteTenths / 10n}.${absoluteTenths % 10n}`;
}

export function formatUSD(value: number | string | bigint) {
  let num: number;
  if (typeof value === "bigint") {
    num = Number(value) / 100;
  } else if (typeof value === "string") {
    num = parseFloat(value) || 0;
  } else {
    num = value;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(num);
}
