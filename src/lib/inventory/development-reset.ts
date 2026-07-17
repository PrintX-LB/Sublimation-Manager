import type { Prisma } from "@prisma/client";

/** Development-only reset of inventory history. Balances are deliberately preserved. */
export async function clearInventoryForDevelopmentReset(tx: Prisma.TransactionClient) {
  const detached = await tx.inventoryTransaction.updateMany({
    data: { correctsTransactionId: null, productionMaterialConsumptionId: null, orderId: null, orderItemId: null, productionAttemptId: null, productionIncidentId: null },
  });
  const materialConsumptions = await tx.productionMaterialConsumption.deleteMany();
  const stockMovements = await tx.stockMovement.deleteMany();
  const inventoryTransactions = await tx.inventoryTransaction.deleteMany();
  return { detached: detached.count, materialConsumptions: materialConsumptions.count, stockMovements: stockMovements.count, inventoryTransactions: inventoryTransactions.count };
}
