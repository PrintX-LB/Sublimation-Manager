-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_StockMovement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productVariantId" TEXT NOT NULL,
    "orderItemId" TEXT,
    "movementType" TEXT NOT NULL,
    "orderId" TEXT,
    "quantityChange" DECIMAL NOT NULL,
    "stockBefore" DECIMAL NOT NULL,
    "stockAfter" DECIMAL NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "productionIncidentId" TEXT,
    "productionAttemptId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockMovement_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockMovement_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockMovement_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockMovement_productionIncidentId_fkey" FOREIGN KEY ("productionIncidentId") REFERENCES "ProductionIncident" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockMovement_productionAttemptId_fkey" FOREIGN KEY ("productionAttemptId") REFERENCES "ProductionAttempt" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_StockMovement" ("createdAt", "id", "movementType", "note", "orderId", "orderItemId", "productVariantId", "productionIncidentId", "quantityChange", "reason", "stockAfter", "stockBefore") SELECT "createdAt", "id", "movementType", "note", "orderId", "orderItemId", "productVariantId", "productionIncidentId", "quantityChange", "reason", "stockAfter", "stockBefore" FROM "StockMovement";
DROP TABLE "StockMovement";
ALTER TABLE "new_StockMovement" RENAME TO "StockMovement";
CREATE UNIQUE INDEX "StockMovement_productionIncidentId_key" ON "StockMovement"("productionIncidentId");
CREATE UNIQUE INDEX "StockMovement_productionAttemptId_key" ON "StockMovement"("productionAttemptId");
CREATE INDEX "StockMovement_productVariantId_idx" ON "StockMovement"("productVariantId");
CREATE INDEX "StockMovement_orderItemId_idx" ON "StockMovement"("orderItemId");
CREATE INDEX "StockMovement_orderId_idx" ON "StockMovement"("orderId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
