-- CreateTable
CREATE TABLE "PrintSheetEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sheetId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "note" TEXT,
    "relatedSheetId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PrintSheetEvent_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "PrintSheet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PrintSheet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sheetNumber" TEXT,
    "filename" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "widthPx" INTEGER NOT NULL,
    "heightPx" INTEGER NOT NULL,
    "dpi" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'READY_TO_PRINT',
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "printedAt" DATETIME,
    "cancelledAt" DATETIME,
    "sourceSheetId" TEXT,
    "regenerationNumber" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PrintSheet_sourceSheetId_fkey" FOREIGN KEY ("sourceSheetId") REFERENCES "PrintSheet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_PrintSheet" ("createdAt", "dpi", "filename", "heightPx", "id", "storagePath", "widthPx") SELECT "createdAt", "dpi", "filename", "heightPx", "id", "storagePath", "widthPx" FROM "PrintSheet";
DROP TABLE "PrintSheet";
ALTER TABLE "new_PrintSheet" RENAME TO "PrintSheet";
CREATE UNIQUE INDEX "PrintSheet_sheetNumber_key" ON "PrintSheet"("sheetNumber");
CREATE INDEX "PrintSheet_createdAt_idx" ON "PrintSheet"("createdAt");
CREATE INDEX "PrintSheet_status_createdAt_idx" ON "PrintSheet"("status", "createdAt");
CREATE TABLE "new_PrintSheetSlot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sheetId" TEXT NOT NULL,
    "slotNumber" INTEGER NOT NULL,
    "artworkVersionId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderItemId" TEXT,
    "productionAttemptId" TEXT,
    CONSTRAINT "PrintSheetSlot_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "PrintSheet" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PrintSheetSlot_artworkVersionId_fkey" FOREIGN KEY ("artworkVersionId") REFERENCES "ArtworkVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PrintSheetSlot_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PrintSheetSlot_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PrintSheetSlot_productionAttemptId_fkey" FOREIGN KEY ("productionAttemptId") REFERENCES "ProductionAttempt" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_PrintSheetSlot" ("artworkVersionId", "id", "orderId", "sheetId", "slotNumber") SELECT "artworkVersionId", "id", "orderId", "sheetId", "slotNumber" FROM "PrintSheetSlot";
DROP TABLE "PrintSheetSlot";
ALTER TABLE "new_PrintSheetSlot" RENAME TO "PrintSheetSlot";
CREATE INDEX "PrintSheetSlot_artworkVersionId_idx" ON "PrintSheetSlot"("artworkVersionId");
CREATE INDEX "PrintSheetSlot_orderId_idx" ON "PrintSheetSlot"("orderId");
CREATE UNIQUE INDEX "PrintSheetSlot_sheetId_slotNumber_key" ON "PrintSheetSlot"("sheetId", "slotNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "PrintSheetEvent_sheetId_createdAt_idx" ON "PrintSheetEvent"("sheetId", "createdAt");
