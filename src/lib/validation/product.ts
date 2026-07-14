import { z } from "zod";

const money = z
  .string()
  .trim()
  .regex(
    /^\d{1,9}(?:\.\d{1,2})?$/,
    "Use a positive amount with up to two decimal places",
  );
const quantity = z.coerce.number().int().min(0).max(1_000_000);
const optionalId = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.string().uuid().optional(),
);
const optionalVariantText = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.string().trim().max(100).optional(),
);

export const productVariantSchema = z.object({
  id: optionalId,
  name: z.string().trim().min(1, "Variant name is required").max(100),
  optionName: optionalVariantText,
  optionValue: optionalVariantText,
  sellingPrice: money,
  productionCost: money,
  stockQuantity: quantity,
  reorderLevel: quantity,
  stockPerUnit: z
    .string()
    .trim()
    .regex(
      /^\d{1,6}(?:\.\d{1,3})?$/,
      "Use a positive quantity with up to three decimal places",
    )
    .refine(
      (value) => Number(value) > 0,
      "Stock consumed per unit must be greater than zero",
    ),
});

export const productSchema = z
  .object({
    name: z.string().trim().min(2, "Product name is required").max(150),
    description: z
      .string()
      .trim()
      .max(2000)
      .optional()
      .transform((value) => value || undefined),
    categoryId: z.string().uuid("Choose a category"),
    printTemplateId: optionalId,
    variants: z.array(productVariantSchema).min(1, "Add at least one variant").max(50),
  });

export const categorySchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((value) => value || undefined),
});
export const entityIdSchema = z.string().uuid("Invalid identifier");
export type ProductInput = z.infer<typeof productSchema>;
