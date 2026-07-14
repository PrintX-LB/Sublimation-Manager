-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "inventoryType" TEXT NOT NULL,
    "baseUnit" TEXT NOT NULL,
    "currentQuantity" DECIMAL NOT NULL DEFAULT 0,
    "minimumQuantity" DECIMAL NOT NULL DEFAULT 0,
    "unitCost" DECIMAL NOT NULL DEFAULT 0,
    "sku" TEXT,
    "brand" TEXT,
    "supplier" TEXT,
    "storageLocation" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "productVariantId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InventoryItem_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InventoryTransaction" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryTransaction_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryTransaction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryTransaction_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryTransaction_productionIncidentId_fkey" FOREIGN KEY ("productionIncidentId") REFERENCES "ProductionIncident" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryTransaction_productionAttemptId_fkey" FOREIGN KEY ("productionAttemptId") REFERENCES "ProductionAttempt" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_sku_key" ON "InventoryItem"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_productVariantId_key" ON "InventoryItem"("productVariantId");

-- CreateIndex
CREATE INDEX "InventoryItem_inventoryType_isActive_idx" ON "InventoryItem"("inventoryType", "isActive");

-- CreateIndex
CREATE INDEX "InventoryItem_name_idx" ON "InventoryItem"("name");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryTransaction_idempotencyKey_key" ON "InventoryTransaction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "InventoryTransaction_inventoryItemId_createdAt_idx" ON "InventoryTransaction"("inventoryItemId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryTransaction_transactionType_createdAt_idx" ON "InventoryTransaction"("transactionType", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryTransaction_orderId_idx" ON "InventoryTransaction"("orderId");

-- Backfill one inventory item for every existing sellable variant. ProductVariant
-- remains linked so historical orders and stock movements continue to resolve.
INSERT INTO "InventoryItem" (
    "id", "name", "inventoryType", "baseUnit", "currentQuantity",
    "minimumQuantity", "unitCost", "sku", "isActive", "productVariantId",
    "createdAt", "updatedAt"
)
SELECT
    lower(hex(randomblob(16))),
    p."name" || ' - ' || v."name",
    'BLANK_PRODUCT',
    'PIECE',
    v."stockQuantity",
    v."reorderLevel",
    v."productionCost",
    v."sku",
    v."isActive",
    v."id",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "ProductVariant" v
JOIN "Product" p ON p."id" = v."productId"
WHERE NOT EXISTS (
    SELECT 1 FROM "InventoryItem" i WHERE i."productVariantId" = v."id"
);
