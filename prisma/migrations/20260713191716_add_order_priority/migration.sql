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
    "filesDeletedAt" DATETIME,
    "retainFilesPermanently" BOOLEAN NOT NULL DEFAULT false,
    "retentionExtendedUntil" DATETIME,
    CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("cancelledAt", "completedAt", "createdAt", "customerId", "customerNotes", "deliveredAt", "deliveryCharge", "deliveryMethod", "discountType", "discountValue", "dueDate", "filesDeletedAt", "finalStatusAt", "id", "internalNotes", "isTestOrder", "orderNumber", "retainFilesPermanently", "retentionExtendedUntil", "status", "stockCommitted", "stockCommittedAt", "subtotal", "tax", "total", "updatedAt") SELECT "cancelledAt", "completedAt", "createdAt", "customerId", "customerNotes", "deliveredAt", "deliveryCharge", "deliveryMethod", "discountType", "discountValue", "dueDate", "filesDeletedAt", "finalStatusAt", "id", "internalNotes", "isTestOrder", "orderNumber", "retainFilesPermanently", "retentionExtendedUntil", "status", "stockCommitted", "stockCommittedAt", "subtotal", "tax", "total", "updatedAt" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");
CREATE INDEX "Order_customerId_idx" ON "Order"("customerId");
CREATE INDEX "Order_status_dueDate_idx" ON "Order"("status", "dueDate");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
