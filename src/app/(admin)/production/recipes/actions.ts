"use server";

import { revalidatePath } from "next/cache";
import { addRecipeItem, createOrUpdateRecipe, RECIPE_ROLES, CONSUMPTION_STAGES, removeRecipeItem, setRecipeActive, updateRecipeItem } from "@/lib/production/recipes";

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim();

export async function saveRecipeAction(formData: FormData) {
  await createOrUpdateRecipe({ productVariantId: text(formData, "productVariantId"), name: text(formData, "name") || "Default production recipe", active: true });
  revalidatePath("/production/recipes");
}

export async function addRecipeItemAction(formData: FormData) {
  const role = text(formData, "materialRole"); const stage = text(formData, "consumptionStage");
  if (!(RECIPE_ROLES as readonly string[]).includes(role) || !(CONSUMPTION_STAGES as readonly string[]).includes(stage)) throw new Error("Select a valid recipe role and stage.");
  await addRecipeItem({ recipeId: text(formData, "recipeId"), inventoryItemId: text(formData, "inventoryItemId"), quantity: text(formData, "quantity"), unit: text(formData, "unit"), materialRole: role as (typeof RECIPE_ROLES)[number], consumptionStage: stage as (typeof CONSUMPTION_STAGES)[number], required: formData.get("required") === "on", notes: text(formData, "notes") });
  revalidatePath("/production/recipes");
}

export async function updateRecipeItemAction(formData: FormData) {
  const role = text(formData, "materialRole"); const stage = text(formData, "consumptionStage");
  if (!(RECIPE_ROLES as readonly string[]).includes(role) || !(CONSUMPTION_STAGES as readonly string[]).includes(stage)) throw new Error("Select a valid recipe role and stage.");
  await updateRecipeItem({ id: text(formData, "id"), inventoryItemId: text(formData, "inventoryItemId"), quantity: text(formData, "quantity"), unit: text(formData, "unit"), materialRole: role as (typeof RECIPE_ROLES)[number], consumptionStage: stage as (typeof CONSUMPTION_STAGES)[number], required: formData.get("required") === "on", notes: text(formData, "notes") });
  revalidatePath("/production/recipes");
}

export async function removeRecipeItemAction(formData: FormData) {
  await removeRecipeItem(text(formData, "id"));
  revalidatePath("/production/recipes");
}

export async function toggleRecipeAction(formData: FormData) {
  await setRecipeActive(text(formData, "recipeId"), formData.get("active") !== "true");
  revalidatePath("/production/recipes");
}
