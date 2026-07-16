-- CreateTable
CREATE TABLE "ProductionAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderItemId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "blankConsumed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductionAttempt_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductionIncident" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderItemId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "additionalMaterialCost" DECIMAL NOT NULL DEFAULT 0,
    "failedAttemptId" TEXT,
    "replacementAttemptId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductionIncident_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductionIncident_failedAttemptId_fkey" FOREIGN KEY ("failedAttemptId") REFERENCES "ProductionAttempt" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProductionIncident_replacementAttemptId_fkey" FOREIGN KEY ("replacementAttemptId") REFERENCES "ProductionAttempt" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "dueDate" DATETIME,
    "deliveryMethod" TEXT,
    "subtotal" DECIMAL NOT NULL DEFAULT 0,
    "discountType" TEXT NOT NULL DEFAULT 'fixed',
    "discountValue" DECIMAL NOT NULL DEFAULT 0,
    "deliveryCharge" DECIMAL NOT NULL DEFAULT 0,
    "tax" DECIMAL NOT NULL DEFAULT 0,
    "total" DECIMAL NOT NULL DEFAULT 0,
    "customerNotes" TEXT,
    "internalNotes" TEXT,
    "isTestOrder" BOOLEAN NOT NULL DEFAULT false,
    "priority" TEXT NOT NULL DEFAULT 'Normal',
    "stockCommitted" BOOLEAN NOT NULL DEFAULT false,
    "stockCommittedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    "deliveredAt" DATETIME,
    "cancelledAt" DATETIME,
    "finalStatusAt" DATETIME,
    "actualProductionCost" DECIMAL NOT NULL DEFAULT 0,
    "filesDeletedAt" DATETIME,
    "retainFilesPermanently" BOOLEAN NOT NULL DEFAULT false,
    "retentionExtendedUntil" DATETIME,
    CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("cancelledAt", "completedAt", "createdAt", "customerId", "customerNotes", "deliveredAt", "deliveryCharge", "deliveryMethod", "discountType", "discountValue", "dueDate", "filesDeletedAt", "finalStatusAt", "id", "internalNotes", "isTestOrder", "orderNumber", "priority", "retainFilesPermanently", "retentionExtendedUntil", "status", "stockCommitted", "stockCommittedAt", "subtotal", "tax", "total", "updatedAt") SELECT "cancelledAt", "completedAt", "createdAt", "customerId", "customerNotes", "deliveredAt", "deliveryCharge", "deliveryMethod", "discountType", "discountValue", "dueDate", "filesDeletedAt", "finalStatusAt", "id", "internalNotes", "isTestOrder", "orderNumber", "priority", "retainFilesPermanently", "retentionExtendedUntil", "status", "stockCommitted", "stockCommittedAt", "subtotal", "tax", "total", "updatedAt" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");
CREATE INDEX "Order_customerId_idx" ON "Order"("customerId");
CREATE INDEX "Order_status_dueDate_idx" ON "Order"("status", "dueDate");
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockMovement_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockMovement_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockMovement_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockMovement_productionIncidentId_fkey" FOREIGN KEY ("productionIncidentId") REFERENCES "ProductionIncident" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_StockMovement" ("createdAt", "id", "movementType", "note", "orderId", "orderItemId", "productVariantId", "quantityChange", "reason", "stockAfter", "stockBefore") SELECT "createdAt", "id", "movementType", "note", "orderId", "orderItemId", "productVariantId", "quantityChange", "reason", "stockAfter", "stockBefore" FROM "StockMovement";
DROP TABLE "StockMovement";
ALTER TABLE "new_StockMovement" RENAME TO "StockMovement";
CREATE UNIQUE INDEX "StockMovement_productionIncidentId_key" ON "StockMovement"("productionIncidentId");
CREATE INDEX "StockMovement_productVariantId_idx" ON "StockMovement"("productVariantId");
CREATE INDEX "StockMovement_orderItemId_idx" ON "StockMovement"("orderItemId");
CREATE INDEX "StockMovement_orderId_idx" ON "StockMovement"("orderId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ProductionAttempt_status_idx" ON "ProductionAttempt"("status");

-- CreateIndex
CREATE INDEX "ProductionAttempt_orderItemId_createdAt_idx" ON "ProductionAttempt"("orderItemId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionAttempt_orderItemId_attemptNumber_key" ON "ProductionAttempt"("orderItemId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionIncident_idempotencyKey_key" ON "ProductionIncident"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionIncident_failedAttemptId_key" ON "ProductionIncident"("failedAttemptId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionIncident_replacementAttemptId_key" ON "ProductionIncident"("replacementAttemptId");

-- CreateIndex
CREATE INDEX "ProductionIncident_orderItemId_createdAt_idx" ON "ProductionIncident"("orderItemId", "createdAt");
