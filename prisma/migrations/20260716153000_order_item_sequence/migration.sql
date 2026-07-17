-- Stable, human-readable production item references within each order.
ALTER TABLE "OrderItem" ADD COLUMN "itemSequence" INTEGER NOT NULL DEFAULT 1;

WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "orderId"
    ORDER BY "createdAt" ASC, "id" ASC
  ) AS "sequence"
  FROM "OrderItem"
)
UPDATE "OrderItem"
SET "itemSequence" = (
  SELECT "sequence" FROM ranked WHERE ranked."id" = "OrderItem"."id"
);

CREATE UNIQUE INDEX "OrderItem_orderId_itemSequence_key"
ON "OrderItem"("orderId", "itemSequence");
