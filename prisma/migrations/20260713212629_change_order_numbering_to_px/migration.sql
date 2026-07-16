-- Migrates existing order numbers to the new PX00001 format while preserving sequence
-- Updates OrderTable, order audit logs, and paths reference tables

-- 1. Create a temporary mapping using row numbers to assign PX sequential numbers to existing orders
CREATE TABLE _order_migration (
  id TEXT PRIMARY KEY,
  oldNumber TEXT,
  newNumber TEXT
);

INSERT INTO _order_migration (id, oldNumber, newNumber)
SELECT 
  id, 
  orderNumber as oldNumber,
  'PX' || printf('%05d', row_number() OVER (ORDER BY createdAt ASC, orderNumber ASC)) as newNumber
FROM "Order";

-- 2. Update Order table order numbers
UPDATE "Order"
SET orderNumber = (SELECT newNumber FROM _order_migration WHERE _order_migration.id = "Order".id)
WHERE id IN (SELECT id FROM _order_migration);

-- 3. Update AdminAuditLog order numbers
UPDATE "AdminAuditLog"
SET orderNumber = (SELECT newNumber FROM _order_migration WHERE _order_migration.oldNumber = "AdminAuditLog".orderNumber)
WHERE orderNumber IN (SELECT oldNumber FROM _order_migration);

-- 4. Update order-global sequences (Ensure next PX format sequence starts from max sequence count)
INSERT OR REPLACE INTO "Sequence" (key, value)
VALUES ('order-global', (SELECT COALESCE(MAX(CAST(SUBSTR(newNumber, 3) AS INTEGER)), 0) FROM _order_migration));

-- 5. Drop migration helper mapping
DROP TABLE _order_migration;