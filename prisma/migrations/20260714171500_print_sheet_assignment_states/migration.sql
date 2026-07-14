-- Preserve assignment history while enforcing uniqueness only for active assignments.
DROP INDEX IF EXISTS "PrintSheetSlot_productionAttemptId_key";
ALTER TABLE "PrintSheetSlot" ADD COLUMN "assignmentState" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "PrintSheetSlot" ADD COLUMN "assignedAt" DATETIME;
UPDATE "PrintSheetSlot" SET "assignedAt" = CURRENT_TIMESTAMP WHERE "assignedAt" IS NULL;
ALTER TABLE "PrintSheetSlot" ADD COLUMN "releasedAt" DATETIME;
ALTER TABLE "PrintSheetSlot" ADD COLUMN "releaseReason" TEXT;
ALTER TABLE "PrintSheetSlot" ADD COLUMN "supersedingSheetId" TEXT;
CREATE UNIQUE INDEX "PrintSheetSlot_active_productionAttemptId_key" ON "PrintSheetSlot"("productionAttemptId") WHERE "productionAttemptId" IS NOT NULL AND "assignmentState" = 'ACTIVE';
CREATE INDEX "PrintSheetSlot_assignmentState_idx" ON "PrintSheetSlot"("assignmentState");
