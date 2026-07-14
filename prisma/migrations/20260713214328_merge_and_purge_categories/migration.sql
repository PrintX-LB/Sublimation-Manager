-- Purge unapproved categories and re-assign existing products securely.
-- 1. Ensure the five approved categories exist in standard casing.
INSERT OR IGNORE INTO "ProductCategory" (id, name, description, isArchived, createdAt, updatedAt)
VALUES
  ('cat-drinkware', 'Drinkware', 'Drinkware category', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cat-clothing', 'Clothing', 'Clothing category', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cat-homegifts', 'Home & Gifts', 'Home and Gifts category', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cat-officeacc', 'Office & Accessories', 'Office and Accessories category', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cat-other', 'Other', 'Other miscellaneous items', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- 2. Move products using duplicate or case-variant versions of approved categories to standard categories.
-- Drinkware duplicates
UPDATE "Product"
SET categoryId = 'cat-drinkware'
WHERE categoryId IN (
  SELECT id FROM "ProductCategory"
  WHERE LOWER(TRIM(name)) = 'drinkware' AND id != 'cat-drinkware'
);

-- Clothing duplicates
UPDATE "Product"
SET categoryId = 'cat-clothing'
WHERE categoryId IN (
  SELECT id FROM "ProductCategory"
  WHERE LOWER(TRIM(name)) = 'clothing' AND id != 'cat-clothing'
);

-- Home & Gifts duplicates
UPDATE "Product"
SET categoryId = 'cat-homegifts'
WHERE categoryId IN (
  SELECT id FROM "ProductCategory"
  WHERE (LOWER(TRIM(name)) = 'home & gifts' OR LOWER(TRIM(name)) = 'home and gifts') AND id != 'cat-homegifts'
);

-- Office & Accessories duplicates
UPDATE "Product"
SET categoryId = 'cat-officeacc'
WHERE categoryId IN (
  SELECT id FROM "ProductCategory"
  WHERE (LOWER(TRIM(name)) = 'office & accessories' OR LOWER(TRIM(name)) = 'office and accessories') AND id != 'cat-officeacc'
);

-- Other duplicates
UPDATE "Product"
SET categoryId = 'cat-other'
WHERE categoryId IN (
  SELECT id FROM "ProductCategory"
  WHERE LOWER(TRIM(name)) = 'other' AND id != 'cat-other'
);

-- 3. Move all products belonging to any OTHER category to 'Other'
UPDATE "Product"
SET categoryId = 'cat-other'
WHERE categoryId NOT IN ('cat-drinkware', 'cat-clothing', 'cat-homegifts', 'cat-officeacc', 'cat-other')
  OR categoryId IS NULL;

-- 4. Delete all categories that are not the standard 5 approved categories
DELETE FROM "ProductCategory"
WHERE id NOT IN ('cat-drinkware', 'cat-clothing', 'cat-homegifts', 'cat-officeacc', 'cat-other');