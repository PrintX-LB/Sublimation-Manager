-- CreateTable
CREATE TABLE "OrderFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderFile_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
    "stockCommitted" BOOLEAN NOT NULL DEFAULT false,
    "stockCommittedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("createdAt", "customerId", "dueDate", "id", "orderNumber", "status", "subtotal", "tax", "total", "updatedAt") SELECT "createdAt", "customerId", "dueDate", "id", "orderNumber", "status", "subtotal", "tax", "total", "updatedAt" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");
CREATE INDEX "Order_customerId_idx" ON "Order"("customerId");
CREATE INDEX "Order_status_dueDate_idx" ON "Order"("status", "dueDate");
CREATE TABLE "new_OrderItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "productVariantId" TEXT,
    "description" TEXT NOT NULL,
    "productNameSnapshot" TEXT NOT NULL,
    "skuSnapshot" TEXT NOT NULL,
    "productionCostSnapshot" DECIMAL NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL NOT NULL,
    "lineDiscountType" TEXT NOT NULL DEFAULT 'fixed',
    "lineDiscountValue" DECIMAL NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL NOT NULL,
    "customerArtworkPath" TEXT,
    "printReadyArtworkPath" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrderItem_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_OrderItem" ("createdAt", "customerArtworkPath", "description", "id", "lineTotal", "orderId", "printReadyArtworkPath", "productVariantId", "quantity", "unitPrice", "updatedAt") SELECT "createdAt", "customerArtworkPath", "description", "id", "lineTotal", "orderId", "printReadyArtworkPath", "productVariantId", "quantity", "unitPrice", "updatedAt" FROM "OrderItem";
DROP TABLE "OrderItem";
ALTER TABLE "new_OrderItem" RENAME TO "OrderItem";
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");
CREATE INDEX "OrderItem_productVariantId_idx" ON "OrderItem"("productVariantId");
CREATE TABLE "new_ProductVariant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "optionName" TEXT,
    "optionValue" TEXT,
    "sellingPrice" DECIMAL NOT NULL,
    "productionCost" DECIMAL NOT NULL DEFAULT 0,
    "stockQuantity" DECIMAL NOT NULL DEFAULT 0,
    "reorderLevel" DECIMAL NOT NULL DEFAULT 0,
    "stockPerUnit" DECIMAL NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ProductVariant" ("createdAt", "id", "isActive", "name", "optionName", "optionValue", "productId", "productionCost", "reorderLevel", "sellingPrice", "sku", "stockPerUnit", "stockQuantity", "updatedAt") SELECT "createdAt", "id", "isActive", "name", "optionName", "optionValue", "productId", "productionCost", "reorderLevel", "sellingPrice", "sku", "stockPerUnit", "stockQuantity", "updatedAt" FROM "ProductVariant";
DROP TABLE "ProductVariant";
ALTER TABLE "new_ProductVariant" RENAME TO "ProductVariant";
CREATE UNIQUE INDEX "ProductVariant_sku_key" ON "ProductVariant"("sku");
CREATE INDEX "ProductVariant_productId_idx" ON "ProductVariant"("productId");
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockMovement_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockMovement_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockMovement_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_StockMovement" ("createdAt", "id", "movementType", "note", "orderItemId", "productVariantId") SELECT "createdAt", "id", "movementType", "note", "orderItemId", "productVariantId" FROM "StockMovement";
DROP TABLE "StockMovement";
ALTER TABLE "new_StockMovement" RENAME TO "StockMovement";
CREATE INDEX "StockMovement_productVariantId_idx" ON "StockMovement"("productVariantId");
CREATE INDEX "StockMovement_orderItemId_idx" ON "StockMovement"("orderItemId");
CREATE INDEX "StockMovement_orderId_idx" ON "StockMovement"("orderId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "OrderFile_orderId_idx" ON "OrderFile"("orderId");

