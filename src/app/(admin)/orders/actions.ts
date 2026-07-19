"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/lib/forms/state";
import {
  createOrder,
  updateDraftOrder,
  transitionOrder,
  addPayment,
  updateCommittedItemQuantity,
  recordProductionIncident,
  releaseUnconsumedOrderStock,
} from "@/lib/orders/service";
import { PRODUCTION_INCIDENT_REASONS, OTHER_MATERIAL_WASTE_OPTIONS } from "@/lib/orders/production-incident-options";
import { prisma } from "@/lib/db/prisma";
import { saveUploadedFile } from "@/lib/files/local-file-storage";
import { getOrderArtworkDirectory, saveArtworkFile } from "@/lib/files/artwork-storage";
import { requireAdmin } from "@/lib/admin-session";
import { correctMaterialConsumption } from "@/lib/production/recipes";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { ensureOrderFolder } from "@/lib/order-storage";
import {
  orderIdSchema,
  orderInputSchema,
  paymentSchema,
  statusSchema,
} from "@/lib/validation/order";

function values(formData: FormData) {
  let items: unknown = [];
  try {
    items = JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    items = [];
  }

  const getOptString = (name: string) => {
    const val = formData.get(name);
    if (val === null || val === "") return undefined;
    return String(val).trim();
  };

  return {
    customerId: getOptString("customerId"),
    newCustomerName: getOptString("newCustomerName"),
    newCustomerPhone: getOptString("newCustomerPhone"),
    newCustomerEmail: getOptString("newCustomerEmail"),
    dueDate: getOptString("dueDate"),
    deliveryMethod: getOptString("deliveryMethod") || "Collection",
    discountType: formData.get("discountType") || "fixed",
    discountValue: getOptString("discountValue") || "0",
    deliveryCharge: getOptString("deliveryCharge") || "0",
    customerNotes: getOptString("customerNotes"),
    internalNotes: getOptString("internalNotes"),
    isTestOrder: formData.get("isTestOrder") === "on",
    items,
  };
}

export async function createOrderAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const input = values(formData);
  const customerSearch = String(formData.get("customerSearch") ?? "").trim();
  if (customerSearch) {
    const existing = await prisma.customer.findFirst({
      where: { fullName: customerSearch, isArchived: false },
      select: { id: true },
    });
    if (existing) input.customerId = existing.id;
    else input.newCustomerName = customerSearch;
  }

  const fieldErrors: Record<string, string[]> = {};

  interface OrderFormItemInput {
    variantId?: string;
    quantity?: number;
    discountType?: "fixed" | "percentage";
    discountValue?: string;
  }

  if (Array.isArray(input.items)) {
    const items = input.items as OrderFormItemInput[];
    const variantIds = items.map((item) => item.variantId).filter(Boolean) as string[];
    const dbVariants = await prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
    });
    const variantMap = new Map(dbVariants.map((v) => [v.id, v]));

    items.forEach((item, index) => {
      if (!item.variantId || item.variantId === "") {
        fieldErrors[`items.${index}.variantId`] = ["Select a product variant"];
      } else {
        const variant = variantMap.get(item.variantId);
        if (!variant) {
          fieldErrors[`items.${index}.variantId`] = ["Product variant not found"];
        } else {
          if (item.discountType === "fixed") {
            const val = parseFloat(item.discountValue || "0") || 0;
            const subtotal = Number(variant.sellingPrice) * (parseInt(String(item.quantity ?? 1)) || 1);
            if (val > subtotal) {
              fieldErrors[`items.${index}.discountValue`] = ["Discount cannot exceed the line subtotal."];
            }
          }
        }
      }

      if (item.discountType === "percentage") {
        const val = parseFloat(item.discountValue || "0") || 0;
        if (val > 100) {
          fieldErrors[`items.${index}.discountValue`] = ["Percentage discount cannot exceed 100%"];
        }
      }
    });
  }

  const parsed = orderInputSchema.safeParse(input);
  if (!parsed.success || Object.keys(fieldErrors).length > 0) {
    const combinedErrors: Record<string, string[]> = { ...fieldErrors };
    if (!parsed.success) {
      parsed.error.issues.forEach((issue) => {
        const path = issue.path.join(".");
        if (!combinedErrors[path]) {
          combinedErrors[path] = [];
        }
        combinedErrors[path].push(issue.message);
      });
    }

    if (process.env.NODE_ENV === "development") {
      console.error("Validation failed:", combinedErrors);
    }

    return {
      message: "Please correct the errors in the form.",
      fieldErrors: combinedErrors,
    };
  }

  try {
    const order = await createOrder(parsed.data);
    const customer = await prisma.customer.findUnique({ where: { id: order.customerId }, select: { fullName: true } });
    await ensureOrderFolder(order.orderNumber, customer?.fullName);
    const savedArtworkPaths: string[] = [];
    try {
      for (const [index, item] of order.items.entries()) {
        const file = formData.get(`artwork-${index}`);
        if (!(file instanceof File) || file.size === 0) continue;
        const relative = await saveArtworkFile(file, order.orderNumber, "original", order.createdAt.getFullYear(), order.createdAt.getMonth() + 1, customer?.fullName);
        savedArtworkPaths.push(relative);
        await prisma.orderItem.update({ where: { id: item.id }, data: { customerArtworkPath: relative } });
        await prisma.orderFile.create({ data: { orderId: order.id, originalFilename: file.name, storagePath: relative, mimeType: file.type, sizeBytes: file.size } });
      }
    } catch (error) {
      await Promise.all(savedArtworkPaths.map((storedPath) => rm(storedPath, { force: true })));
      await prisma.order.delete({ where: { id: order.id } }).catch(() => undefined);
      console.error("New order artwork upload failed", error);
      return { message: "The order was not saved because an artwork file could not be stored. Please try again." };
    }
    revalidatePath("/orders");
    redirect(`/orders/${order.id}?success=true`);
  } catch (error) {
    // Next.js redirect throws a special error — let it propagate so the redirect works.
    if (
      error instanceof Error &&
      error.message === "NEXT_REDIRECT"
    ) {
      throw error;
    }

    // Always log the full technical details to the terminal.
    console.error(
      "═══════════════════════════════════════════════════════\n" +
      "ORDER CREATION FAILED\n" +
      "═══════════════════════════════════════════════════════",
    );
    if (error instanceof Error) {
      console.error("Type       :", error.constructor.name);
      console.error("Message    :", error.message);
      // PrismaClientKnownRequestError has a code property
      const prismaError = error as Error & { code?: string; meta?: unknown };
      if (prismaError.code) {
        console.error("Prisma code:", prismaError.code);
        console.error("Prisma meta:", JSON.stringify(prismaError.meta, null, 2));
      }
      console.error("Stack:\n", error.stack);
    } else {
      console.error("Unknown error:", error);
    }
    console.error("Input snapshot:", JSON.stringify(parsed.data, null, 2));
    console.error("═══════════════════════════════════════════════════════");

    // Classify the error into a specific user-friendly message.
    if (error instanceof Error) {
      const msg = error.message;
      const code = (error as Error & { code?: string }).code;

      if (msg === "CUSTOMER_NOT_FOUND") {
        return { message: "The selected customer could not be found. Please select a valid customer." };
      }
      if (msg === "VARIANT_NOT_FOUND") {
        return { message: "One or more selected products are no longer available. Please review your selections." };
      }
      if (msg === "INSUFFICIENT_STOCK") {
        return { message: "There is not enough stock to fulfil this order. Please check stock levels." };
      }
      if (msg === "STOCK_CONFLICT") {
        return { message: "A stock conflict occurred. Please try again." };
      }
      if (msg === "INVALID_STATUS") {
        return { message: "The order status is not valid." };
      }

      // Prisma P2002: Unique constraint violation (e.g. duplicate orderNumber)
      if (code === "P2002") {
        const prismaError = error as Error & { meta?: { target?: string[] } };
        const field = prismaError.meta?.target?.join(", ") ?? "unknown field";
        console.error(`Unique constraint failed on: ${field}`);
        return { message: "A duplicate entry was detected. Please try again." };
      }
      // Prisma P2003: Foreign key constraint failed
      if (code === "P2003") {
        const prismaError = error as Error & { meta?: { field_name?: string } };
        const field = prismaError.meta?.field_name ?? "unknown relation";
        console.error(`Foreign key constraint failed on: ${field}`);
        return { message: `A required relation is missing (${field}). Please check your selections.` };
      }
      // Prisma P2025: Record not found (used in updateMany / findUniqueOrThrow)
      if (code === "P2025") {
        return { message: "A required record could not be found in the database." };
      }
      // Prisma P2011: Null constraint violated
      if (code === "P2011") {
        const prismaError = error as Error & { meta?: { constraint?: string } };
        const field = prismaError.meta?.constraint ?? "unknown field";
        return { message: `A required field is missing: ${field}. Please fill in all required fields.` };
      }
      // Other Prisma errors (P2xxx)
      if (code?.startsWith("P2")) {
        return { message: `A database error occurred (code: ${code}). Please try again.` };
      }
      // Money/validation error from decimalToCents (thrown inside calculateTotals)
      if (msg.includes("positive amount")) {
        return { message: "One of the order amounts contains an invalid number. Please check pricing fields." };
      }
    }

    return { message: "The order could not be saved. Check the terminal for details." };
  }
}
export async function updateOrderAction(id: string, _state: FormState, formData: FormData): Promise<FormState> {
  let items: unknown = []; try { items = JSON.parse(String(formData.get("items") ?? "[]")); } catch { return { message: "Order items are invalid." }; }
  const parsed = orderInputSchema.safeParse({ customerId: formData.get("customerId"), newCustomerName: "", newCustomerPhone: "", newCustomerEmail: "", dueDate: formData.get("dueDate"), deliveryMethod: formData.get("deliveryMethod"), discountType: formData.get("discountType"), discountValue: formData.get("discountValue"), deliveryCharge: formData.get("deliveryCharge"), customerNotes: formData.get("customerNotes"), internalNotes: formData.get("internalNotes"), isTestOrder: formData.get("isTestOrder") === "on", items });
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "Check the order details." };
  try { await updateDraftOrder(id, parsed.data); } catch (error) { return { message: error instanceof Error && error.message === "ORDER_EDIT_RESTRICTED" ? "Only Draft orders without committed stock can be fully edited." : "The order could not be updated." }; }
  revalidatePath(`/orders/${id}`); redirect(`/orders/${id}`);
}
export async function transitionOrderAction(formData: FormData) {
  const id = orderIdSchema.parse(formData.get("id"));
  const status = statusSchema.parse(formData.get("status"));
  try {
    await transitionOrder(id, status);
  } catch (error) {
    if (error instanceof Error && error.message === "INSUFFICIENT_STOCK") {
      // This is an expected operational validation failure. Do not let it
      // become Next.js' generic server exception screen in the desktop app.
      redirect(`/orders/${id}?transitionError=insufficient_stock`);
    }
    throw error;
  }
  revalidatePath("/orders");
  revalidatePath(`/orders/${id}`);
}

export async function updateOrderPriorityAction(formData: FormData) {
  const id = orderIdSchema.parse(formData.get("id"));
  const priority = String(formData.get("priority") ?? "Normal");
  if (priority !== "Normal" && priority !== "Urgent") throw new Error("INVALID_PRIORITY");
  await prisma.order.update({ where: { id }, data: { priority } });
  revalidatePath("/production");
  revalidatePath(`/orders/${id}`);
}

export async function recordProductionIncidentAction(formData: FormData) {
  const orderItemId = String(formData.get("orderItemId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const idempotencyKey = String(formData.get("idempotencyKey") ?? "").trim();
  const blankOutcome = String(formData.get("blankProductOutcome") ?? "").trim();
  const otherMaterialWasted = String(formData.get("otherMaterialWasted") ?? "").trim();
  let wastedMaterials: Array<{ inventoryItemId: string; quantity: string }> = [];
  try {
    const parsedWaste = JSON.parse(String(formData.get("wastedMaterials") ?? "[]")) as unknown;
    if (Array.isArray(parsedWaste)) wastedMaterials = parsedWaste.filter((entry): entry is { inventoryItemId: string; quantity: string } => typeof entry === "object" && entry !== null && typeof (entry as { inventoryItemId?: unknown }).inventoryItemId === "string" && typeof (entry as { quantity?: unknown }).quantity === "string");
  } catch {
    return { error: "The selected material waste is invalid." };
  }
  if (!orderItemId || !idempotencyKey) return { error: "The incident form is incomplete. Please try again." };
  if (blankOutcome !== "damaged" && blankOutcome !== "usable")
    return { error: "Select whether the blank product was damaged or is still usable." };
  if (!(OTHER_MATERIAL_WASTE_OPTIONS as readonly string[]).includes(otherMaterialWasted))
    return { error: "Select the other material wasted option." };
  if (!(PRODUCTION_INCIDENT_REASONS as readonly string[]).includes(reason))
    return { error: "Select a valid production incident reason." };
  try {
    await recordProductionIncident({ orderItemId, reason, note, idempotencyKey, blankProductDamaged: blankOutcome === "damaged", otherMaterialWasted, wastedMaterials });
    revalidatePath("/production");
    revalidatePath("/orders");
    const item = await prisma.orderItem.findUnique({ where: { id: orderItemId }, select: { orderId: true } });
    if (item) revalidatePath(`/orders/${item.orderId}`);
    return { success: "The failed attempt was recorded and a replacement was queued." };
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const messages: Record<string, string> = {
      INSUFFICIENT_STOCK: "There is not enough blank stock for this reprint.",
      ORDER_NOT_IN_PRODUCTION: "Only orders currently in production can be reprinted.",
      PRODUCTION_ATTEMPT_ALREADY_FAILED: "This production attempt is already marked as failed.",
      ORDER_ITEM_NOT_FOUND: "The order item could not be found.",
      VARIANT_NOT_FOUND: "The product variant for this item is no longer available.",
      STOCK_CONFLICT: "Stock changed while recording the reprint. Please try again.",
      BLANK_OUTCOME_REQUIRED: "Select whether the blank product was damaged or is still usable.",
      MATERIAL_NOT_IN_RECIPE: "Select only materials configured in this product's active recipe.",
      INSUFFICIENT_RECIPE_STOCK: "There is not enough stock for one or more selected materials.",
    };
    return { error: messages[code] ?? "The reprint could not be recorded. Please try again." };
  }
}

export async function correctMaterialConsumptionAction(formData: FormData) {
  await requireAdmin();
  const consumptionId = String(formData.get("consumptionId") ?? "").trim();
  const delta = String(formData.get("delta") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const idempotencyKey = String(formData.get("idempotencyKey") ?? "").trim();
  if (!consumptionId || !delta || !reason || !idempotencyKey) throw new Error("Correction reason, quantity and confirmation are required.");
  await correctMaterialConsumption({ consumptionId, delta, reason, note: String(formData.get("note") ?? "").trim(), idempotencyKey });
  const item = await prisma.productionMaterialConsumption.findUnique({ where: { id: consumptionId }, select: { orderId: true } });
  if (item?.orderId) revalidatePath(`/orders/${item.orderId}`);
}
export async function addPaymentAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = paymentSchema.safeParse({
    orderId: formData.get("orderId"),
    amount: formData.get("amount"),
    method: formData.get("method"),
    reference: formData.get("reference"),
  });
  if (!parsed.success) return { message: "Enter a valid payment." };
  try {
    await addPayment(parsed.data);
  } catch (error) {
    console.error("Payment failed", error);
    return { message: "The payment could not be saved." };
  }
  revalidatePath(`/orders/${parsed.data.orderId}`);
  return { message: "Payment recorded." };
}
export async function markFullyPaidAction(formData: FormData) {
  const orderId = orderIdSchema.parse(formData.get("orderId"));
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { total: true, payments: { select: { amount: true } } } });
  if (!order) throw new Error("ORDER_NOT_FOUND");
  const paid = order.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const remaining = Number(order.total) - paid;
  if (remaining > 0) await addPayment({ orderId, amount: remaining.toFixed(2), method: String(formData.get("method") || "other") });
  revalidatePath(`/orders/${orderId}`);
}
export async function uploadOrderFileAction(formData: FormData) {
  const orderId = orderIdSchema.parse(formData.get("orderId"));
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0)
    throw new Error("Choose a file.");
  const path = await saveUploadedFile(file, "orders");
  await prisma.orderFile.create({
    data: {
      orderId,
      originalFilename: file.name,
      storagePath: path,
      mimeType: file.type,
      sizeBytes: file.size,
    },
  });
  revalidatePath(`/orders/${orderId}`);
}
export async function uploadArtworkAction(formData: FormData) {
  const orderItemId = String(formData.get("orderItemId") ?? "");
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("Choose an image.");
  const item = await prisma.orderItem.findUnique({
    where: { id: orderItemId },
    include: { order: { include: { customer: true } } },
  });
  if (!item) throw new Error("ORDER_ITEM_NOT_FOUND");
  const now = new Date();
  const relative = await saveArtworkFile(
    file,
    item.order.orderNumber,
    "original",
    now.getFullYear(),
    now.getMonth() + 1,
    item.order.customer.fullName,
  );
  await prisma.orderItem.update({
    where: { id: item.id },
    data: { customerArtworkPath: relative },
  });
  revalidatePath(`/orders/${item.orderId}`);
  revalidatePath(`/orders/${item.orderId}/items/${item.id}/artwork`);
}
export async function uploadArtworkLayerAction(formData: FormData) {
  const orderItemId = String(formData.get("orderItemId") ?? "");
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("Choose an image.");
  const item = await prisma.orderItem.findUnique({ where: { id: orderItemId }, include: { order: { include: { customer: true } } } });
  if (!item) throw new Error("ORDER_ITEM_NOT_FOUND");
  const now = new Date();
  const relative = await saveArtworkFile(file, item.order.orderNumber, "original", now.getFullYear(), now.getMonth() + 1, item.order.customer.fullName);
  await prisma.orderFile.create({ data: { orderId: item.orderId, originalFilename: file.name, storagePath: relative, mimeType: file.type, sizeBytes: file.size } });
  return relative;
}
export async function saveArtworkExportAction(formData: FormData) {
  const itemId = String(formData.get("orderItemId") ?? "");
  const dataUrl = String(formData.get("dataUrl") ?? "");
  const baseDataUrl = String(formData.get("baseDataUrl") ?? dataUrl);
  const withContour = String(formData.get("withContour") ?? "off") === "on";
  const widthPx = Number(formData.get("widthPx"));
  const heightPx = Number(formData.get("heightPx"));
  const zoom = Number(formData.get("zoom"));
  const rotation = Number(formData.get("rotation"));
  const positionX = Number(formData.get("positionX"));
  const positionY = Number(formData.get("positionY"));
  const item = await prisma.orderItem.findUnique({
    where: { id: itemId },
    include: { order: { include: { customer: true } }, productVariant: { include: { product: { include: { printTemplate: true } } } } },
  });
  const templateDpi = item?.productVariant?.product.printTemplate?.dpi;
  if (
    !item ||
    !/^data:image\/png;base64,/.test(dataUrl) ||
    !/^data:image\/png;base64,/.test(baseDataUrl) ||
    !Number.isInteger(widthPx) ||
    widthPx < 1 ||
    !Number.isInteger(heightPx) ||
    heightPx < 1 || !Number.isFinite(zoom) || zoom <= 0 ||
    !Number.isFinite(rotation) || !Number.isFinite(positionX) || !Number.isFinite(positionY) ||
    !templateDpi || !Number.isInteger(templateDpi) || templateDpi < 1
  )
    throw new Error("ARTWORK_EXPORT_INVALID");
  if (dataUrl.length > 50 * 1024 * 1024 || baseDataUrl.length > 50 * 1024 * 1024) throw new Error("ARTWORK_EXPORT_TOO_LARGE");
  const editedFolder = await getOrderArtworkDirectory(item.order.orderNumber, "edited", item.order.customer.fullName);
  const printReadyFolder = withContour
    ? await getOrderArtworkDirectory(item.order.orderNumber, "print-ready", item.order.customer.fullName)
    : null;
  try {
    await mkdir(editedFolder, { recursive: true });
    if (printReadyFolder) await mkdir(printReadyFolder, { recursive: true });
  } catch (error) {
    console.error("Artwork export directory creation failed", error);
    throw new Error("Unable to create the print-ready artwork folder. Check upload folder permissions.");
  }
  const projectKey = `artwork-${itemId}`;
  const sequence = await prisma.sequence.upsert({
    where: { key: projectKey },
    update: { value: { increment: 1 } },
    create: { key: projectKey, value: 1 },
  });
  const version = sequence.value;
  const filename = `version-${version}-${Date.now()}.png`;
  const editedPath = path.join(editedFolder, filename);
  const printReadyPath = printReadyFolder ? path.join(printReadyFolder, filename) : null;
  try {
    const pngBuffer = Buffer.from(dataUrl.slice("data:image/png;base64,".length), "base64");
    const basePngBuffer = Buffer.from(baseDataUrl.slice("data:image/png;base64,".length), "base64");
    const metadata = await sharp(basePngBuffer).metadata();
    if (metadata.width !== widthPx || metadata.height !== heightPx) throw new Error("Export dimensions do not match the print template.");
    const taggedBasePng = await sharp(basePngBuffer).withMetadata({ density: templateDpi }).png().toBuffer();
    await writeFile(
      editedPath,
      taggedBasePng,
      { flag: "wx" },
    );
    if (printReadyPath) {
      const taggedPrintReadyPng = await sharp(pngBuffer).withMetadata({ density: templateDpi }).png().toBuffer();
      await writeFile(printReadyPath, taggedPrintReadyPng, { flag: "wx" });
    }
  } catch (error) {
    console.error("Artwork export file write failed", error);
    throw new Error("Unable to save the print-ready PNG. Check upload folder permissions and available disk space.");
  }
  const project = await prisma.artworkProject.upsert({
    where: { orderItemId: itemId },
    update: { zoom, rotation, positionX, positionY },
    create: {
      orderItemId: itemId,
      originalPath: item.customerArtworkPath ?? "",
      zoom,
      rotation,
      positionX,
      positionY,
    },
  });
  const previousVersion = await prisma.artworkVersion.findFirst({
    where: { projectId: project.id },
    orderBy: { version: "desc" },
    select: { printReadyPath: true },
  });
  const created = await prisma.artworkVersion.create({
    data: {
      projectId: project.id,
      version,
      editedPath,
      printReadyPath: printReadyPath ?? previousVersion?.printReadyPath ?? editedPath,
      widthPx,
      heightPx,
    },
  });
  await prisma.artworkProject.update({
    where: { id: project.id },
    data: { activeVersionId: created.id },
  });
  revalidatePath(`/orders/${item.orderId}`);
}

export async function saveArtworkStateAction(formData: FormData) {
  const orderItemId = String(formData.get("orderItemId") ?? "");
  const item = await prisma.orderItem.findUnique({ where: { id: orderItemId } });
  if (!item) throw new Error("ORDER_ITEM_NOT_FOUND");
  const documentJson = String(formData.get("documentJson") ?? "");
  if (!documentJson.startsWith("{")) throw new Error("ARTWORK_STATE_INVALID");
  let parsedDocument: unknown;
  try { parsedDocument = JSON.parse(documentJson); } catch { throw new Error("ARTWORK_STATE_INVALID"); }
  const persistedDocument = JSON.stringify({ version: 1, document: parsedDocument, positionX: Number(formData.get("positionX")), positionY: Number(formData.get("positionY")), zoom: Number(formData.get("zoom")), rotation: Number(formData.get("rotation")) });
  const number = (name: string, fallback = 0) => {
    const value = Number(formData.get(name));
    return Number.isFinite(value) ? value : fallback;
  };
  const project = await prisma.artworkProject.upsert({
    where: { orderItemId },
    update: {
      positionX: number("positionX"), positionY: number("positionY"),
      zoom: number("zoom", 1), rotation: number("rotation"),
      settingsJson: persistedDocument,
    },
    create: {
      orderItemId, originalPath: item.customerArtworkPath ?? "",
      positionX: number("positionX"), positionY: number("positionY"),
      zoom: number("zoom", 1), rotation: number("rotation"),
      settingsJson: persistedDocument,
    },
  });
  revalidatePath(`/orders/${item.orderId}/items/${item.id}/artwork`);
  return project.id;
}
export async function updateOrderItemQuantityAction(formData: FormData) {
  const orderId = orderIdSchema.parse(formData.get("orderId"));
  const itemId = orderIdSchema.parse(formData.get("itemId"));
  const quantity = Number(formData.get("quantity"));
  await updateCommittedItemQuantity(orderId, itemId, quantity);
  revalidatePath(`/orders/${orderId}`);
  redirect(`/orders/${orderId}`);
}

export async function duplicateOrderAction(formData: FormData) {
  const id = orderIdSchema.parse(formData.get("id"));
  try {
    const order = await prisma.order.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!order) throw new Error("Order not found");

    const sequence = await prisma.sequence.upsert({
      where: { key: "order-global" },
      update: { value: { increment: 1 } },
      create: { key: "order-global", value: 1 },
    });

    const duplicated = await prisma.order.create({
      data: {
        orderNumber: `PX${sequence.value.toString().padStart(5, "0")}`,
        customerId: order.customerId,
        dueDate: null,
        deliveryMethod: order.deliveryMethod,
        discountType: order.discountType,
        discountValue: order.discountValue,
        deliveryCharge: order.deliveryCharge,
        subtotal: order.subtotal,
        total: order.total,
        customerNotes: order.customerNotes,
        internalNotes: order.internalNotes,
        status: "Draft",
        items: {
          create: order.items.map((line, index) => ({
            itemSequence: index + 1,
            productVariantId: line.productVariantId,
            description: line.description,
            productNameSnapshot: line.productNameSnapshot,
            skuSnapshot: line.skuSnapshot,
            productionCostSnapshot: line.productionCostSnapshot,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            lineDiscountType: line.lineDiscountType,
            lineDiscountValue: line.lineDiscountValue,
            lineTotal: line.lineTotal,
          })),
        },
      },
    });

    revalidatePath("/orders");
    redirect(`/orders/${duplicated.id}`);
  } catch (error) {
    if (error instanceof Error && error.message === "NEXT_REDIRECT") throw error; // Allow Next.js redirect to work
    console.error("Order duplication failed", error);
    throw new Error("The order could not be duplicated.");
  }
}
/**
 * Permanently purges an order for the local owner.  Admin Mode is the only
 * authorization boundary; status, payment and stock state are deliberately
 * not used as a second permission check.  Immutable inventory/material
 * history is retained by detaching its optional order references before the
 * operational order records are removed.
 */
export async function permanentlyDeleteOrderAction(formData: FormData) {
  const id = orderIdSchema.parse(formData.get("orderId"));
  const confirmation = String(formData.get("deleteOrderConfirmation") ?? "").trim();
  await requireAdmin();

  const filePaths = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id },
      select: {
        id: true,
        orderNumber: true,
        files: { select: { storagePath: true } },
        items: { select: { id: true, customerArtworkPath: true, printReadyArtworkPath: true } },
      },
    });
    if (!order) throw new Error("ORDER_NOT_FOUND");
    if (confirmation !== order.orderNumber) {
      await tx.adminAuditLog.create({ data: { action: "permanent_order_delete", orderNumber: order.orderNumber, success: false, reason: "Order number confirmation did not match" } });
      throw new Error("ORDER_DELETE_CONFIRMATION_MISMATCH");
    }

    // A Ready-to-Print test order may have reserved blank stock without ever
    // entering production. Release that reservation before deleting the order.
    // Orders with production activity or material consumption remain untouched.
    await releaseUnconsumedOrderStock(tx, id);

    const itemIds = order.items.map((item) => item.id);
    const attemptIds = (await tx.productionAttempt.findMany({ where: { orderItemId: { in: itemIds } }, select: { id: true } })).map((item) => item.id);
    const incidentIds = (await tx.productionIncident.findMany({ where: { orderItemId: { in: itemIds } }, select: { id: true } })).map((item) => item.id);

    // Keep immutable stock/material history, but remove references to the
    // deleted operational records so SQLite foreign keys remain valid.
    await tx.inventoryTransaction.updateMany({ where: { OR: [{ orderId: id }, { orderItemId: { in: itemIds } }, { productionAttemptId: { in: attemptIds } }, { productionIncidentId: { in: incidentIds } }] }, data: { orderId: null, orderItemId: null, productionAttemptId: null, productionIncidentId: null } });
    await tx.productionMaterialConsumption.updateMany({ where: { OR: [{ orderId: id }, { orderItemId: { in: itemIds } }, { productionAttemptId: { in: attemptIds } }, { productionIncidentId: { in: incidentIds } }] }, data: { orderId: null, orderItemId: null, productionAttemptId: null, productionIncidentId: null } });
    await tx.stockMovement.updateMany({ where: { OR: [{ orderId: id }, { orderItemId: { in: itemIds } }, { productionAttemptId: { in: attemptIds } }, { productionIncidentId: { in: incidentIds } }] }, data: { orderId: null, orderItemId: null, productionAttemptId: null, productionIncidentId: null } });

    // A generated sheet may contain another order. Remove only this order's
    // slot; the sheet, file and other order slots remain intact.
    await tx.printSheetSlot.deleteMany({ where: { orderId: id } });
    await tx.payment.deleteMany({ where: { orderId: id } });
    await tx.orderFile.deleteMany({ where: { orderId: id } });
    await tx.productionIncident.deleteMany({ where: { orderItemId: { in: itemIds } } });
    await tx.productionAttempt.deleteMany({ where: { orderItemId: { in: itemIds } } });
    await tx.orderItem.deleteMany({ where: { orderId: id } });
    await tx.adminAuditLog.create({ data: { action: "permanent_order_delete", orderNumber: order.orderNumber, success: true, reason: "Admin Mode purge; immutable inventory/material history retained without order references" } });
    await tx.order.delete({ where: { id } });

    return [
      ...order.files.map((file) => file.storagePath),
      ...order.items.flatMap((item) => [item.customerArtworkPath, item.printReadyArtworkPath].filter((value): value is string => Boolean(value))),
    ];
  });

  // Database deletion is already committed. File cleanup is best-effort and
  // never turns a successful transactional purge into a partial DB rollback.
  await Promise.all(filePaths.map(async (relative) => {
    const candidate = path.resolve(process.cwd(), relative);
    const allowed = [path.resolve(process.cwd(), "uploads"), path.resolve(process.cwd(), "data")].some((root) => candidate.startsWith(`${root}${path.sep}`));
    if (allowed) await rm(candidate, { force: true }).catch((error) => console.error("Order file cleanup failed", relative, error));
  }));
  revalidatePath("/orders");
  revalidatePath("/production");
  revalidatePath("/production/sheets");
  revalidatePath("/inventory");
  revalidatePath("/revenue");
  redirect("/orders?deleted=1");
}

// Backwards-compatible action name used by older UI components.
export const permanentlyDeleteTestOrderAction = permanentlyDeleteOrderAction;
export async function convertCancelledTestOrderToDraftAction(formData: FormData) {
  const id = orderIdSchema.parse(formData.get("orderId")); await requireAdmin();
  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id }, include: { payments: { select: { id: true } }, stockMovements: { select: { id: true } }, items: { include: { stockMovements: { select: { id: true } } } } } });
    if (!order) throw new Error("ORDER_NOT_FOUND");
    const blocked = !order.isTestOrder || order.status !== "Cancelled" || order.payments.length > 0 || order.stockCommitted || order.stockMovements.length > 0 || order.items.some((item) => item.stockMovements.length > 0);
    await tx.adminAuditLog.create({ data: { action: "convert_cancelled_test_order_to_draft", orderNumber: order.orderNumber, success: !blocked, reason: blocked ? "Conversion eligibility failed" : undefined } });
    if (blocked) throw new Error("TEST_ORDER_CONVERSION_BLOCKED");
    await tx.order.update({ where: { id }, data: { status: "Draft" } });
  });
  revalidatePath(`/orders/${id}`);
}
