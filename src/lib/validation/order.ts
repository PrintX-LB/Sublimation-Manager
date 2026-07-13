import { z } from "zod";
import { ORDER_STATUSES } from "@/lib/orders/status";

const id = z.string().uuid("Select a customer");
const money = z
  .string()
  .trim()
  .regex(/^\d{1,9}(?:\.\d{1,2})?$/, "Use a positive currency amount");
const positiveInt = z.coerce.number().int().min(1, "Quantity must be at least 1").max(1_000_000);
const nonNegativeMoney = z
  .string()
  .trim()
  .regex(/^\d{1,9}(?:\.\d{1,2})?$/, "Use a positive currency amount");

export const orderItemInputSchema = z.object({
  variantId: z.string().uuid("Select a product variant"),
  quantity: positiveInt,
  discountType: z.enum(["fixed", "percentage"]),
  discountValue: nonNegativeMoney,
});
export const orderInputSchema = z
  .object({
    customerId: z.preprocess(
      (value) => (value === "" || value === null ? undefined : value),
      z.string().uuid("Select a customer").optional(),
    ),
    newCustomerName: z
      .string()
      .trim()
      .min(2)
      .max(150)
      .optional()
      .or(z.literal("")),
    newCustomerPhone: z.string().trim().max(40).optional().or(z.literal("")),
    newCustomerEmail: z
      .string()
      .trim()
      .email()
      .max(254)
      .optional()
      .or(z.literal("")),
    dueDate: z.preprocess(
      (value) => (value === "" || value === null ? undefined : value),
      z
        .string()
        .regex(/^\d{2}\/\d{2}\/\d{4}$/, "Choose a valid due date.")
        .transform(
          (value) =>
            `${value.slice(6)}-${value.slice(3, 5)}-${value.slice(0, 2)}`,
        )
        .optional(),
    ),
    deliveryMethod: z.string().trim().max(100).optional(),
    discountType: z.enum(["fixed", "percentage"]),
    discountValue: nonNegativeMoney,
    deliveryCharge: nonNegativeMoney,
    customerNotes: z.string().trim().max(2000).optional(),
    internalNotes: z.string().trim().max(4000).optional(),
    isTestOrder: z.boolean().optional(),
    items: z
      .array(orderItemInputSchema)
      .min(1, "Add at least one order item")
      .max(100),
  })
  .superRefine((data, context) => {
    if (!data.customerId && !data.newCustomerName)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customerId"],
        message: "Choose a customer or enter a new customer name",
      });
  });
export const orderIdSchema = id;
export const statusSchema = z.enum(ORDER_STATUSES);
export const paymentSchema = z.object({
  orderId: id,
  amount: money,
  method: z.enum(["cash", "card", "bank_transfer", "other"]),
  reference: z.string().trim().max(100).optional(),
});
export const stockAdjustmentSchema = z.object({
  variantId: id,
  delta: z
    .string()
    .trim()
    .regex(/^-?\d{1,9}(?:\.\d{1,3})?$/, "Enter a stock change"),
  reason: z.string().trim().min(1, "A reason is required").max(500),
  movementType: z.enum(["manual_addition", "correction", "damage", "return"]),
});
export type OrderInput = z.infer<typeof orderInputSchema>;

export function formatZodIssues(issues: z.ZodIssue[]): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  issues.forEach((issue) => {
    const path = issue.path.join(".");
    if (!errors[path]) {
      errors[path] = [];
    }
    errors[path].push(issue.message);
  });
  return errors;
}
