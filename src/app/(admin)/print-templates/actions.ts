"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
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
export async function saveTemplateAction(formData: FormData) {
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
  )
    throw new Error("Enter valid template dimensions and DPI.");
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
  if (input.cutMarkMode !== "NONE" && markOffset + markLength > Math.min(Number(input.widthMm), Number(input.heightMm)) / 2)
    throw new Error("Cut marks do not fit inside the template bounds.");
  if (id) await prisma.printTemplate.update({ where: { id }, data });
  else await prisma.printTemplate.create({ data });
  revalidatePath("/print-templates");
  redirect("/print-templates");
}
