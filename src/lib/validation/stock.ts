import { z } from "zod";

const quantity = z
  .string()
  .trim()
  .regex(/^\d{1,9}(?:\.\d{1,3})?$/, "Enter a positive quantity.");

export const stockQuantitySchema = z.object({
  variantId: z.string().uuid(),
  amount: quantity,
  reason: z.string().trim().min(1).max(500),
});

export const renameVariantSchema = z.object({
  variantId: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
});
