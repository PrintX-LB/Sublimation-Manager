-- Add a unique request key so retries cannot create duplicate physical regenerations.
ALTER TABLE "PrintSheet" ADD COLUMN "regenerationRequestKey" TEXT;
CREATE UNIQUE INDEX "PrintSheet_regenerationRequestKey_key" ON "PrintSheet"("regenerationRequestKey");
