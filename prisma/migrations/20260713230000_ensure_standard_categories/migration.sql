-- Keep the development database on the five supported product categories.
-- The category IDs are stable so products can be reassigned safely and the
-- migration remains idempotent if a backup was restored after the first purge.
INSERT OR IGNORE INTO "ProductCategory" ("id", "name", "description", "isArchived", "createdAt", "updatedAt")
VALUES
  ('cat-drinkware', 'Drinkware', 'Drinkware category', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cat-clothing', 'Clothing', 'Clothing category', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cat-homegifts', 'Home & Gifts', 'Home and Gifts category', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cat-officeacc', 'Office & Accessories', 'Office and Accessories category', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cat-other', 'Other', 'Other miscellaneous items', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Consolidate spelling/case variants before moving any unknown category to Other.
UPDATE "Product"
SET "categoryId" = (SELECT "id" FROM "ProductCategory" WHERE "name" = 'Drinkware')
WHERE "categoryId" IN (SELECT "id" FROM "ProductCategory" WHERE lower(trim("name")) = 'drinkware');

UPDATE "Product"
SET "categoryId" = (SELECT "id" FROM "ProductCategory" WHERE "name" = 'Clothing')
WHERE "categoryId" IN (SELECT "id" FROM "ProductCategory" WHERE lower(trim("name")) = 'clothing');

UPDATE "Product"
SET "categoryId" = (SELECT "id" FROM "ProductCategory" WHERE "name" = 'Home & Gifts')
WHERE "categoryId" IN (SELECT "id" FROM "ProductCategory" WHERE lower(trim("name")) IN ('home & gifts', 'home and gifts'));

UPDATE "Product"
SET "categoryId" = (SELECT "id" FROM "ProductCategory" WHERE "name" = 'Office & Accessories')
WHERE "categoryId" IN (SELECT "id" FROM "ProductCategory" WHERE lower(trim("name")) IN ('office & accessories', 'office and accessories'));

UPDATE "Product"
SET "categoryId" = (SELECT "id" FROM "ProductCategory" WHERE "name" = 'Other')
WHERE "categoryId" IS NULL
   OR "categoryId" NOT IN (SELECT "id" FROM "ProductCategory" WHERE "name" IN ('Drinkware', 'Clothing', 'Home & Gifts', 'Office & Accessories', 'Other'));

DELETE FROM "ProductCategory"
WHERE "name" NOT IN ('Drinkware', 'Clothing', 'Home & Gifts', 'Office & Accessories', 'Other');
