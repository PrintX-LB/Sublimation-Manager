import { z } from "zod";

const optionalText = (maximum: number) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().max(maximum).optional(),
  );

export const customerSchema = z.object({
  fullName: z.string().trim().min(2, "Enter the customer's full name").max(150),
  phone: optionalText(40),
  email: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().email("Enter a valid email address").max(254).optional(),
  ),
  addressLine1: optionalText(150),
  addressLine2: optionalText(150),
  city: optionalText(100),
  postcode: optionalText(30),
  country: optionalText(100),
  deliveryNotes: optionalText(1000),
  internalNotes: optionalText(2000),
});

export const customerIdSchema = z.string().uuid("Invalid customer identifier");
export type CustomerInput = z.infer<typeof customerSchema>;
