-- CreateTable
CREATE TABLE "ArtworkProject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderItemId" TEXT NOT NULL,
    "originalPath" TEXT NOT NULL,
    "templateId" TEXT,
    "positionX" DECIMAL NOT NULL DEFAULT 0,
    "positionY" DECIMAL NOT NULL DEFAULT 0,
    "zoom" DECIMAL NOT NULL DEFAULT 1,
    "rotation" DECIMAL NOT NULL DEFAULT 0,
    "settingsJson" TEXT NOT NULL DEFAULT '{}',
    "activeVersionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ArtworkProject_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ArtworkProject_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "PrintTemplate" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ArtworkVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "editedPath" TEXT NOT NULL,
    "printReadyPath" TEXT NOT NULL,
    "widthPx" INTEGER NOT NULL,
    "heightPx" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArtworkVersion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ArtworkProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PrintTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "widthMm" DECIMAL NOT NULL,
    "heightMm" DECIMAL NOT NULL,
    "dpi" INTEGER NOT NULL DEFAULT 300,
    "safeAreaMm" DECIMAL NOT NULL DEFAULT 0,
    "bleedMm" DECIMAL NOT NULL DEFAULT 0,
    "filePath" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_PrintTemplate" ("createdAt", "filePath", "heightMm", "id", "name", "notes", "updatedAt", "widthMm") SELECT "createdAt", "filePath", "heightMm", "id", "name", "notes", "updatedAt", "widthMm" FROM "PrintTemplate";
DROP TABLE "PrintTemplate";
ALTER TABLE "new_PrintTemplate" RENAME TO "PrintTemplate";
CREATE UNIQUE INDEX "PrintTemplate_name_key" ON "PrintTemplate"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ArtworkProject_orderItemId_key" ON "ArtworkProject"("orderItemId");

-- CreateIndex
CREATE INDEX "ArtworkVersion_projectId_createdAt_idx" ON "ArtworkVersion"("projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ArtworkVersion_projectId_version_key" ON "ArtworkVersion"("projectId", "version");
