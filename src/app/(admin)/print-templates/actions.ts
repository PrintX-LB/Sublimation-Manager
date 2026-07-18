"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export type TemplateFormState = { message?: string };
function values(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim(),
    widthMm: String(formData.get("widthMm") ?? ""),
    heightMm: String(formData.get("heightMm") ?? ""),
    dpi: Number(formData.get("dpi")),
    bleedMm: String(formData.get("bleedMm") ?? "0"),
    safeAreaMm: String(formData.get("safeAreaMm") ?? "0"),
    cutMarkMode: String(formData.get("cutMarkMode") ?? "CORNER_MARKS"),
    cutMarkLengthMm: String(formData.get("cutMarkLengthMm") ?? "8"),
    cutMarkOffsetMm: String(formData.get("cutMarkOffsetMm") ?? "3"),
    cutMarkThicknessMm: String(formData.get("cutMarkThicknessMm") ?? "0.3"),
  };
}
export async function saveTemplateAction(_state: TemplateFormState, formData: FormData): Promise<TemplateFormState> {
  const input = values(formData);
  if (
    !input.name ||
    !/^\d+(?:\.\d{1,3})?$/.test(input.widthMm) ||
    !/^\d+(?:\.\d{1,3})?$/.test(input.heightMm) ||
    !Number.isInteger(input.dpi) ||
    input.dpi < 72 ||
    input.dpi > 1200 ||
    !/^\d+(?:\.\d{1,3})?$/.test(input.cutMarkLengthMm) ||
    Number(input.cutMarkLengthMm) <= 0 ||
    !/^\d+(?:\.\d{1,3})?$/.test(input.cutMarkOffsetMm) ||
    Number(input.cutMarkOffsetMm) < 0 ||
    !/^\d+(?:\.\d{1,3})?$/.test(input.cutMarkThicknessMm) ||
    Number(input.cutMarkThicknessMm) <= 0
  ) return { message: "Enter valid template dimensions and DPI." };
  const id = String(formData.get("id") ?? "");
  const data = {
    name: input.name,
    widthMm: input.widthMm,
    heightMm: input.heightMm,
    dpi: input.dpi,
    bleedMm: input.bleedMm,
    safeAreaMm: input.safeAreaMm,
    cutMarkMode: ["NONE", "CORNER_MARKS", "FULL_OUTLINE"].includes(input.cutMarkMode) ? input.cutMarkMode : "CORNER_MARKS",
    cutMarkLengthMm: input.cutMarkLengthMm,
    cutMarkOffsetMm: input.cutMarkOffsetMm,
    cutMarkThicknessMm: input.cutMarkThicknessMm,
  };
  const markLength = Number(input.cutMarkLengthMm);
  const markOffset = Number(input.cutMarkOffsetMm);
  if (input.cutMarkMode !== "NONE" && markOffset + markLength > Math.min(Number(input.widthMm), Number(input.heightMm)) / 2) {
    return { message: "Cut marks do not fit inside the template bounds." };
  }
  try {
    if (id) await prisma.printTemplate.update({ where: { id }, data });
    else await prisma.printTemplate.create({ data });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { message: "A print template with this name already exists. Choose a different name or edit the existing template." };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return { message: "This print template no longer exists. Return to the template library and try again." };
    }
    console.error("Print template save failed", error);
    return { message: "The print template could not be saved. Please try again." };
  }
  revalidatePath("/print-templates");
  redirect("/print-templates");
}

export async function deleteTemplateAction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("Template id is required.");

  // Products and artwork projects use SetNull relations, so deleting a
  // template does not delete the products or historical artwork that used it.
  await prisma.printTemplate.delete({ where: { id } });
  revalidatePath("/print-templates");
  redirect("/print-templates");
}
