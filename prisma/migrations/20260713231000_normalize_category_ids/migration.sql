-- Product validation expects UUID category IDs. Convert the stable IDs used by
-- the initial cleanup migration without changing category names or products.
UPDATE "Product"
SET "categoryId" = CASE "categoryId"
  WHEN 'cat-drinkware' THEN '00000000-0000-4000-8000-000000000001'
  WHEN 'cat-clothing' THEN '00000000-0000-4000-8000-000000000002'
  WHEN 'cat-homegifts' THEN '00000000-0000-4000-8000-000000000003'
  WHEN 'cat-officeacc' THEN '00000000-0000-4000-8000-000000000004'
  WHEN 'cat-other' THEN '00000000-0000-4000-8000-000000000005'
  ELSE "categoryId"
END
WHERE "categoryId" IN ('cat-drinkware', 'cat-clothing', 'cat-homegifts', 'cat-officeacc', 'cat-other');

UPDATE "ProductCategory" SET "id" = '00000000-0000-4000-8000-000000000001' WHERE "id" = 'cat-drinkware';
UPDATE "ProductCategory" SET "id" = '00000000-0000-4000-8000-000000000002' WHERE "id" = 'cat-clothing';
UPDATE "ProductCategory" SET "id" = '00000000-0000-4000-8000-000000000003' WHERE "id" = 'cat-homegifts';
UPDATE "ProductCategory" SET "id" = '00000000-0000-4000-8000-000000000004' WHERE "id" = 'cat-officeacc';
UPDATE "ProductCategory" SET "id" = '00000000-0000-4000-8000-000000000005' WHERE "id" = 'cat-other';
