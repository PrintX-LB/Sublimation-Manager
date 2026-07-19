-- Container-level tracking for consumable materials. Existing balances and history remain intact.
ALTER TABLE "InventoryItem" ADD COLUMN "defaultContainerCapacity" DECIMAL;
ALTER TABLE "InventoryItem" ADD COLUMN "containerLabel" TEXT;

CREATE TABLE "InventoryContainer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "inventoryItemId" TEXT NOT NULL,
    "originalCapacity" DECIMAL NOT NULL,
    "remainingAmount" DECIMAL NOT NULL,
    "purchaseCost" DECIMAL NOT NULL,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedAt" DATETIME,
    "depletedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'SEALED',
    "note" TEXT,
    "supplierReference" TEXT,
    CONSTRAINT "InventoryContainer_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "InventoryContainer_inventoryItemId_status_receivedAt_idx" ON "InventoryContainer"("inventoryItemId", "status", "receivedAt");

CREATE TABLE "InventoryContainerAllocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "containerId" TEXT NOT NULL,
    "inventoryTransactionId" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "unitCost" DECIMAL NOT NULL,
    "totalCost" DECIMAL NOT NULL,
    "allocationType" TEXT NOT NULL DEFAULT 'CONSUMPTION',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryContainerAllocation_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "InventoryContainer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryContainerAllocation_inventoryTransactionId_fkey" FOREIGN KEY ("inventoryTransactionId") REFERENCES "InventoryTransaction" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "InventoryContainerAllocation_containerId_createdAt_idx" ON "InventoryContainerAllocation"("containerId", "createdAt");
CREATE INDEX "InventoryContainerAllocation_inventoryTransactionId_idx" ON "InventoryContainerAllocation"("inventoryTransactionId");
