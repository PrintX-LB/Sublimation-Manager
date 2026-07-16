-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ProductionIncident" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderItemId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "blankProductDamaged" BOOLEAN NOT NULL DEFAULT false,
    "otherMaterialWasted" TEXT,
    "additionalMaterialCost" DECIMAL NOT NULL DEFAULT 0,
    "failedAttemptId" TEXT,
    "replacementAttemptId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductionIncident_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductionIncident_failedAttemptId_fkey" FOREIGN KEY ("failedAttemptId") REFERENCES "ProductionAttempt" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProductionIncident_replacementAttemptId_fkey" FOREIGN KEY ("replacementAttemptId") REFERENCES "ProductionAttempt" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ProductionIncident" ("additionalMaterialCost", "createdAt", "failedAttemptId", "id", "idempotencyKey", "note", "orderItemId", "reason", "replacementAttemptId") SELECT "additionalMaterialCost", "createdAt", "failedAttemptId", "id", "idempotencyKey", "note", "orderItemId", "reason", "replacementAttemptId" FROM "ProductionIncident";
DROP TABLE "ProductionIncident";
ALTER TABLE "new_ProductionIncident" RENAME TO "ProductionIncident";
CREATE UNIQUE INDEX "ProductionIncident_idempotencyKey_key" ON "ProductionIncident"("idempotencyKey");
CREATE UNIQUE INDEX "ProductionIncident_failedAttemptId_key" ON "ProductionIncident"("failedAttemptId");
CREATE UNIQUE INDEX "ProductionIncident_replacementAttemptId_key" ON "ProductionIncident"("replacementAttemptId");
CREATE INDEX "ProductionIncident_orderItemId_createdAt_idx" ON "ProductionIncident"("orderItemId", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
