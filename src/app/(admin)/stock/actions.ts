"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { manualStockAdjustment } from "@/lib/orders/service";
import { stockAdjustmentSchema } from "@/lib/validation/order";
import {
  renameVariantSchema,
  stockQuantitySchema,
} from "@/lib/validation/stock";
export async function adjustStockAction(formData: FormData) {
  const parsed = stockAdjustmentSchema.safeParse({
    variantId: formData.get("variantId"),
    delta: formData.get("delta"),
    reason: formData.get("reason"),
    movementType: formData.get("movementType"),
  });
  if (!parsed.success) throw new Error("Invalid stock adjustment.");
  await manualStockAdjustment(parsed.data);
  revalidatePath("/stock");
}
async function quantityAction(formData: FormData, sign: 1 | -1, requireReason: boolean) {
  const parsed = stockQuantitySchema.safeParse({
    variantId: formData.get("variantId"),
    amount: formData.get("amount"),
    reason: requireReason ? formData.get("reason") : String(formData.get("reason") ?? "").trim() || "Stock received",
  });
  if (!parsed.success) throw new Error("Enter a valid quantity and reason.");
  await manualStockAdjustment({
    variantId: parsed.data.variantId,
    delta: `${sign < 0 ? "-" : ""}${parsed.data.amount}`,
    reason: parsed.data.reason,
    movementType: sign > 0 ? "manual_addition" : "manual_removal",
  });
  revalidatePath("/stock");
}
export async function addStockAction(formData: FormData) {
  await quantityAction(formData, 1, false);
}
export async function removeStockAction(formData: FormData) {
  await quantityAction(formData, -1, true);
}
export async function renameVariantAction(formData: FormData) {
  const parsed = renameVariantSchema.safeParse({
    variantId: formData.get("variantId"),
    name: formData.get("name"),
  });
  if (!parsed.success) throw new Error("Enter a valid variant name.");
  await prisma.productVariant.update({
    where: { id: parsed.data.variantId },
    data: { name: parsed.data.name },
  });
  revalidatePath("/stock");
  revalidatePath("/products");
}
export async function stockOptions() {
  return prisma.productVariant.findMany({
    where: { isActive: true, product: { isActive: true } },
    select: {
      id: true,
      name: true,
      stockQuantity: true,
      reorderLevel: true,
      product: { select: { name: true } },
    },
    orderBy: [{ product: { name: "asc" } }, { name: "asc" }],
  });
}
