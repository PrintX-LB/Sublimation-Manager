-- CreateTable
CREATE TABLE "ProductionRecipe" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productVariantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductionRecipe_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductionRecipeItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recipeId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "quantity" DECIMAL NOT NULL,
    "unit" TEXT NOT NULL,
    "materialRole" TEXT NOT NULL,
    "consumptionStage" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductionRecipeItem_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "ProductionRecipe" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductionRecipeItem_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductionMaterialConsumption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recipeItemId" TEXT NOT NULL,
    "orderId" TEXT,
    "orderItemId" TEXT,
    "productionAttemptId" TEXT,
    "productionIncidentId" TEXT,
    "printSheetId" TEXT,
    "consumptionStage" TEXT NOT NULL,
    "quantity" DECIMAL NOT NULL,
    "unit" TEXT NOT NULL,
    "unitCost" DECIMAL NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductionMaterialConsumption_recipeItemId_fkey" FOREIGN KEY ("recipeItemId") REFERENCES "ProductionRecipeItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProductionMaterialConsumption_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProductionMaterialConsumption_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProductionMaterialConsumption_productionAttemptId_fkey" FOREIGN KEY ("productionAttemptId") REFERENCES "ProductionAttempt" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProductionMaterialConsumption_productionIncidentId_fkey" FOREIGN KEY ("productionIncidentId") REFERENCES "ProductionIncident" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProductionMaterialConsumption_printSheetId_fkey" FOREIGN KEY ("printSheetId") REFERENCES "PrintSheet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_InventoryTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "inventoryItemId" TEXT NOT NULL,
    "quantityChange" DECIMAL NOT NULL,
    "quantityBefore" DECIMAL NOT NULL,
    "quantityAfter" DECIMAL NOT NULL,
    "unit" TEXT NOT NULL,
    "transactionType" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "unitCost" DECIMAL,
    "totalCost" DECIMAL,
    "supplier" TEXT,
    "orderId" TEXT,
    "orderItemId" TEXT,
    "productionIncidentId" TEXT,
    "productionAttemptId" TEXT,
    "idempotencyKey" TEXT,
    "note" TEXT,
    "productionMaterialConsumptionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryTransaction_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryTransaction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryTransaction_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryTransaction_productionIncidentId_fkey" FOREIGN KEY ("productionIncidentId") REFERENCES "ProductionIncident" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryTransaction_productionAttemptId_fkey" FOREIGN KEY ("productionAttemptId") REFERENCES "ProductionAttempt" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryTransaction_productionMaterialConsumptionId_fkey" FOREIGN KEY ("productionMaterialConsumptionId") REFERENCES "ProductionMaterialConsumption" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_InventoryTransaction" ("createdAt", "id", "idempotencyKey", "inventoryItemId", "note", "orderId", "orderItemId", "productionAttemptId", "productionIncidentId", "quantityAfter", "quantityBefore", "quantityChange", "reason", "supplier", "totalCost", "transactionType", "unit", "unitCost") SELECT "createdAt", "id", "idempotencyKey", "inventoryItemId", "note", "orderId", "orderItemId", "productionAttemptId", "productionIncidentId", "quantityAfter", "quantityBefore", "quantityChange", "reason", "supplier", "totalCost", "transactionType", "unit", "unitCost" FROM "InventoryTransaction";
DROP TABLE "InventoryTransaction";
ALTER TABLE "new_InventoryTransaction" RENAME TO "InventoryTransaction";
CREATE UNIQUE INDEX "InventoryTransaction_idempotencyKey_key" ON "InventoryTransaction"("idempotencyKey");
CREATE UNIQUE INDEX "InventoryTransaction_productionMaterialConsumptionId_key" ON "InventoryTransaction"("productionMaterialConsumptionId");
CREATE INDEX "InventoryTransaction_inventoryItemId_createdAt_idx" ON "InventoryTransaction"("inventoryItemId", "createdAt");
CREATE INDEX "InventoryTransaction_transactionType_createdAt_idx" ON "InventoryTransaction"("transactionType", "createdAt");
CREATE INDEX "InventoryTransaction_orderId_idx" ON "InventoryTransaction"("orderId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ProductionRecipe_productVariantId_key" ON "ProductionRecipe"("productVariantId");

-- CreateIndex
CREATE INDEX "ProductionRecipeItem_inventoryItemId_idx" ON "ProductionRecipeItem"("inventoryItemId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionRecipeItem_recipeId_inventoryItemId_consumptionStage_key" ON "ProductionRecipeItem"("recipeId", "inventoryItemId", "consumptionStage");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionMaterialConsumption_idempotencyKey_key" ON "ProductionMaterialConsumption"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ProductionMaterialConsumption_orderId_orderItemId_idx" ON "ProductionMaterialConsumption"("orderId", "orderItemId");

-- CreateIndex
CREATE INDEX "ProductionMaterialConsumption_productionIncidentId_idx" ON "ProductionMaterialConsumption"("productionIncidentId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionMaterialConsumption_recipeItemId_productionAttemptId_consumptionStage_key" ON "ProductionMaterialConsumption"("recipeItemId", "productionAttemptId", "consumptionStage");
