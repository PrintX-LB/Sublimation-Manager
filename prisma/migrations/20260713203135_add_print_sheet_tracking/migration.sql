-- CreateTable
CREATE TABLE "PrintSheet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filename" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "widthPx" INTEGER NOT NULL,
    "heightPx" INTEGER NOT NULL,
    "dpi" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PrintSheetSlot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sheetId" TEXT NOT NULL,
    "slotNumber" INTEGER NOT NULL,
    "artworkVersionId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    CONSTRAINT "PrintSheetSlot_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "PrintSheet" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PrintSheetSlot_artworkVersionId_fkey" FOREIGN KEY ("artworkVersionId") REFERENCES "ArtworkVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PrintSheetSlot_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PrintSheet_createdAt_idx" ON "PrintSheet"("createdAt");

-- CreateIndex
CREATE INDEX "PrintSheetSlot_artworkVersionId_idx" ON "PrintSheetSlot"("artworkVersionId");

-- CreateIndex
CREATE INDEX "PrintSheetSlot_orderId_idx" ON "PrintSheetSlot"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "PrintSheetSlot_sheetId_slotNumber_key" ON "PrintSheetSlot"("sheetId", "slotNumber");
