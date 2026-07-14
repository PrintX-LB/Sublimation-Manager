-- Prevent one production attempt from being assigned to multiple sheet slots.
CREATE UNIQUE INDEX "PrintSheetSlot_productionAttemptId_key" ON "PrintSheetSlot"("productionAttemptId");
