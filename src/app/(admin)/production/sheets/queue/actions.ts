"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { generateManualSheetAction } from "../../sheet-builder/actions";
import { templateCompatibilityKey } from "@/lib/production/sheet-pairing";
import { SHEET_LAYOUT } from "@/lib/production-sheet";

export async function generateQueueSheetAction(formData: FormData) {
  const attempt1 = String(formData.get("attempt1") ?? "").trim();
  const attempt2 = String(formData.get("attempt2") ?? "").trim();
  if (!attempt1) throw new Error("SELECT_QUEUE_ATTEMPT");
  const ids = [attempt1, ...(attempt2 ? [attempt2] : [])];
  const attempts = await prisma.productionAttempt.findMany({
    where: { id: { in: ids } },
    include: {
      failedIncident: true,
      replacementIncident: true,
      printSheetSlots: { include: { sheet: { select: { status: true } } } },
      orderItem: {
        include: {
          order: { select: { id: true, orderNumber: true, status: true, dueDate: true, customer: { select: { fullName: true } } } },
          productVariant: { select: { name: true, product: { select: { printTemplate: { select: { name: true, widthMm: true, heightMm: true, dpi: true } } } } } },
          artworkProject: {
            include: {
              template: { select: { name: true, widthMm: true, heightMm: true, dpi: true } },
              versions: { orderBy: { version: "desc" }, select: { id: true, printReadyPath: true, editedPath: true, widthPx: true, heightPx: true } },
            },
          },
        },
      },
    },
  });
  const ordered = ids.map((id) =>
    attempts.find((attempt) => attempt.id === id),
  );
  if (!ordered[0] || (attempt2 && !ordered[1]))
    throw new Error("QUEUE_ATTEMPT_NOT_FOUND");
  for (const attempt of ordered) {
    if (
      !attempt ||
      attempt.status !== "Ready to Print" ||
      attempt.failedIncident ||
      attempt.replacementIncident ||
      attempt.orderItem.order.status === "Cancelled" ||
      attempt.printSheetSlots.some(
        (slot) =>
          slot.assignmentState === "ACTIVE" &&
          !["CANCELLED", "SUPERSEDED"].includes(slot.sheet.status),
      )
    )
      throw new Error("STALE_QUEUE_ATTEMPT");
    const version = attempt.orderItem.artworkProject?.activeVersionId
      ? attempt.orderItem.artworkProject.versions.find(
          (candidate) =>
            candidate.id === attempt.orderItem.artworkProject?.activeVersionId,
        )
      : attempt.orderItem.artworkProject?.versions[0];
    if (
      !version ||
      version.widthPx !== SHEET_LAYOUT.designWidthPx ||
      version.heightPx !== SHEET_LAYOUT.designHeightPx
    )
      throw new Error("QUEUE_ARTWORK_INVALID");
  }
  const keyFor = (attempt: NonNullable<(typeof ordered)[number]>) => {
    const template =
      attempt.orderItem.artworkProject?.template ??
      attempt.orderItem.productVariant?.product.printTemplate;
    if (!template) throw new Error("QUEUE_TEMPLATE_MISSING");
    return templateCompatibilityKey({
      name: template.name,
      widthMm: Number(template.widthMm),
      heightMm: Number(template.heightMm),
      dpi: template.dpi,
    });
  };
  if (ordered[1] && keyFor(ordered[0]!) !== keyFor(ordered[1]))
    throw new Error("QUEUE_INCOMPATIBLE");
  const firstVersion = ordered[0]!.orderItem.artworkProject?.activeVersionId
    ? ordered[0]!.orderItem.artworkProject.versions.find(
        (candidate) =>
          candidate.id ===
          ordered[0]!.orderItem.artworkProject?.activeVersionId,
      )
    : ordered[0]!.orderItem.artworkProject?.versions[0];
  const secondVersion = ordered[1]
    ? ordered[1].orderItem.artworkProject?.activeVersionId
      ? ordered[1].orderItem.artworkProject.versions.find(
          (candidate) =>
            candidate.id ===
            ordered[1]!.orderItem.artworkProject?.activeVersionId,
        )
      : ordered[1].orderItem.artworkProject?.versions[0]
    : undefined;
  if (!firstVersion) throw new Error("QUEUE_ARTWORK_INVALID");
  const generation = new FormData();
  generation.set("slot1", firstVersion.id);
  if (secondVersion) generation.set("slot2", secondVersion.id);
  generation.set("attempt1", attempt1);
  if (attempt2) generation.set("attempt2", attempt2);
  generation.set("includeStrips", "on");
  generation.set("includeContour", "on");
  await generateManualSheetAction(generation);
  revalidatePath("/production/sheets/queue");
  revalidatePath("/production/sheets");
  redirect("/production/sheets/queue?generated=1");
}
