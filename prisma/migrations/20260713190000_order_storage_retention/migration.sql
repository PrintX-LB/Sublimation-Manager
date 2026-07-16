-- Add local order-file retention metadata and persisted application settings.
ALTER TABLE "OrderFile" ADD COLUMN "deletedAt" DATETIME;

CREATE TABLE "AppSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "AppSetting_key_key" ON "AppSetting"("key");

ALTER TABLE "Order" ADD COLUMN "completedAt" DATETIME;
ALTER TABLE "Order" ADD COLUMN "filesDeletedAt" DATETIME;
ALTER TABLE "Order" ADD COLUMN "retainFilesPermanently" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN "retentionExtendedUntil" DATETIME;
