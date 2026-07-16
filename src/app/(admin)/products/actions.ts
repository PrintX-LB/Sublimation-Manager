"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/lib/forms/state";
import { prisma } from "@/lib/db/prisma";
import {
  archiveProduct,
  createProduct,
  updateProduct,
} from "@/lib/repositories/products";
import {
  categorySchema,
  entityIdSchema,
  productSchema,
} from "@/lib/validation/product";

function productValues(formData: FormData) {
  let variants: unknown = [];
  try {
    variants = JSON.parse(String(formData.get("variants") ?? "[]"));
  } catch {
    variants = [];
  }
  return {
    name: formData.get("name"),
    description: formData.get("description"),
    categoryId: formData.get("categoryId"),
    printTemplateId: formData.get("printTemplateId"),
    variants,
  };
}

function productError(error: unknown): FormState {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  )
    return { message: "A product variant conflicts with an existing record." };
  if (error instanceof Error && error.message === "INVALID_RELATION")
    return {
      message:
        "The selected category or print template is no longer available.",
    };
  if (error instanceof Error && error.message === "NOT_FOUND")
    return { message: "This product no longer exists." };
  console.error("Product save failed", error);
  return { message: "The product could not be saved. Please try again." };
}

export async function createProductAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = productSchema.safeParse(productValues(formData));
  if (!parsed.success)
    return {
      message: parsed.error.issues[0]?.message ?? "Check the product details.",
    };
  let product;
  try {
    product = await createProduct(parsed.data);
  } catch (error) {
    return productError(error);
  }
  revalidatePath("/products");
  redirect(`/products/${product.id}`);
}

export async function updateProductAction(
  id: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const validId = entityIdSchema.safeParse(id);
  const parsed = productSchema.safeParse(productValues(formData));
  if (!validId.success) return { message: "Invalid product identifier." };
  if (!parsed.success)
    return {
      message: parsed.error.issues[0]?.message ?? "Check the product details.",
    };
  try {
    await updateProduct(validId.data, parsed.data);
  } catch (error) {
    return productError(error);
  }
  revalidatePath("/products");
  revalidatePath(`/products/${id}`);
  redirect(`/products/${id}`);
}

export async function archiveProductAction(formData: FormData) {
  const id = entityIdSchema.parse(formData.get("id"));
  try {
    await archiveProduct(id);
  } catch (error) {
    console.error("Product archive failed", error);
    throw new Error("The product could not be archived.");
  }
  revalidatePath("/products");
  redirect("/products");
}

export async function saveCategoryAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = categorySchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
  });
  const idValue = formData.get("id");
  const id = idValue ? entityIdSchema.safeParse(idValue) : null;
  if (!parsed.success)
    return {
      message: "Enter a category name containing at least two characters.",
    };
  if (id && !id.success) return { message: "Invalid category identifier." };
  const duplicate = await prisma.productCategory.findFirst({
    where: {
      name: parsed.data.name,
      ...(id?.success ? { id: { not: id.data } } : {}),
    },
  });
  if (duplicate)
    return { message: "A category with that name already exists." };
  try {
    if (id?.success)
      await prisma.productCategory.update({
        where: { id: id.data },
        data: parsed.data,
      });
    else await prisma.productCategory.create({ data: parsed.data });
  } catch (error) {
    console.error("Category save failed", error);
    return { message: "The category could not be saved." };
  }
  revalidatePath("/products/categories");
  return { message: "Category saved." };
}

export async function archiveCategoryAction(formData: FormData) {
  const id = entityIdSchema.parse(formData.get("id"));
  await prisma.productCategory.update({
    where: { id },
    data: { isArchived: true, archivedAt: new Date() },
  });
  revalidatePath("/products/categories");
}
