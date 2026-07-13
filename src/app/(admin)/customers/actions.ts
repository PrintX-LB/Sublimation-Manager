"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/lib/forms/state";
import {
  archiveCustomer,
  createCustomer,
  updateCustomer,
} from "@/lib/repositories/customers";
import { customerIdSchema, customerSchema } from "@/lib/validation/customer";

function customerValues(formData: FormData) {
  return {
    fullName: formData.get("fullName"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    addressLine1: formData.get("addressLine1"),
    addressLine2: formData.get("addressLine2"),
    city: formData.get("city"),
    postcode: formData.get("postcode"),
    country: formData.get("country"),
    deliveryNotes: formData.get("deliveryNotes"),
    internalNotes: formData.get("internalNotes"),
  };
}

export async function createCustomerAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = customerSchema.safeParse(customerValues(formData));
  if (!parsed.success)
    return {
      message: "Check the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  let customer;
  try {
    customer = await createCustomer(parsed.data);
  } catch (error) {
    console.error("Customer creation failed", error);
    return { message: "The customer could not be created. Please try again." };
  }
  revalidatePath("/customers");
  redirect(`/customers/${customer.id}`);
}

export async function updateCustomerAction(
  id: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const validId = customerIdSchema.safeParse(id);
  const parsed = customerSchema.safeParse(customerValues(formData));
  if (!validId.success) return { message: "Invalid customer identifier." };
  if (!parsed.success)
    return {
      message: "Check the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  try {
    await updateCustomer(validId.data, parsed.data);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    )
      return { message: "This customer no longer exists." };
    console.error("Customer update failed", error);
    return { message: "The customer could not be updated. Please try again." };
  }
  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  redirect(`/customers/${id}`);
}

export async function archiveCustomerAction(formData: FormData) {
  const id = customerIdSchema.parse(formData.get("id"));
  try {
    await archiveCustomer(id);
  } catch (error) {
    console.error("Customer archive failed", error);
    throw new Error("The customer could not be archived.");
  }
  revalidatePath("/customers");
  redirect("/customers");
}
