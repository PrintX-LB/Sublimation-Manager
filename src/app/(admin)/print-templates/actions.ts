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
    input.dpi > 1200
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
  };
  if (id) await prisma.printTemplate.update({ where: { id }, data });
  else await prisma.printTemplate.create({ data });
  revalidatePath("/print-templates");
  redirect("/print-templates");
}
