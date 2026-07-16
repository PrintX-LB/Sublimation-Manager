/*
  Warnings:

  - You are about to drop the column `billingAddress` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `notes` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `basePrice` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `price` on the `ProductVariant` table. All the data in the column will be lost.
  - Added the required column `customerNumber` to the `Customer` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fullName` to the `Customer` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sellingPrice` to the `ProductVariant` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "Sequence" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" INTEGER NOT NULL DEFAULT 0
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerNumber" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "postcode" TEXT,
    "country" TEXT,
    "deliveryNotes" TEXT,
    "internalNotes" TEXT,
    "imagePath" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Customer" ("createdAt", "email", "id", "imagePath", "phone", "updatedAt") SELECT "createdAt", "email", "id", "imagePath", "phone", "updatedAt" FROM "Customer";
DROP TABLE "Customer";
ALTER TABLE "new_Customer" RENAME TO "Customer";
CREATE UNIQUE INDEX "Customer_customerNumber_key" ON "Customer"("customerNumber");
CREATE INDEX "Customer_fullName_idx" ON "Customer"("fullName");
CREATE INDEX "Customer_email_idx" ON "Customer"("email");
CREATE INDEX "Customer_phone_idx" ON "Customer"("phone");
CREATE INDEX "Customer_isArchived_idx" ON "Customer"("isArchived");
CREATE TABLE "new_Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "categoryId" TEXT,
    "printTemplateId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Product_printTemplateId_fkey" FOREIGN KEY ("printTemplateId") REFERENCES "PrintTemplate" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Product" ("categoryId", "createdAt", "description", "id", "isActive", "name", "printTemplateId", "updatedAt") SELECT "categoryId", "createdAt", "description", "id", "isActive", "name", "printTemplateId", "updatedAt" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");
CREATE INDEX "Product_printTemplateId_idx" ON "Product"("printTemplateId");
CREATE INDEX "Product_name_idx" ON "Product"("name");
CREATE INDEX "Product_isActive_idx" ON "Product"("isActive");
CREATE TABLE "new_ProductCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_ProductCategory" ("createdAt", "description", "id", "name", "updatedAt") SELECT "createdAt", "description", "id", "name", "updatedAt" FROM "ProductCategory";
DROP TABLE "ProductCategory";
ALTER TABLE "new_ProductCategory" RENAME TO "ProductCategory";
CREATE UNIQUE INDEX "ProductCategory_name_key" ON "ProductCategory"("name");
CREATE TABLE "new_ProductVariant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "optionName" TEXT,
    "optionValue" TEXT,
    "sellingPrice" DECIMAL NOT NULL,
    "productionCost" DECIMAL NOT NULL DEFAULT 0,
    "stockQuantity" INTEGER NOT NULL DEFAULT 0,
    "reorderLevel" INTEGER NOT NULL DEFAULT 0,
    "stockPerUnit" DECIMAL NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ProductVariant" ("createdAt", "id", "isActive", "name", "productId", "reorderLevel", "sku", "stockQuantity", "updatedAt") SELECT "createdAt", "id", "isActive", "name", "productId", "reorderLevel", "sku", "stockQuantity", "updatedAt" FROM "ProductVariant";
DROP TABLE "ProductVariant";
ALTER TABLE "new_ProductVariant" RENAME TO "ProductVariant";
CREATE UNIQUE INDEX "ProductVariant_sku_key" ON "ProductVariant"("sku");
CREATE INDEX "ProductVariant_productId_idx" ON "ProductVariant"("productId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
