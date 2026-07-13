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
} from "@/lib/orders/service";
import { prisma } from "@/lib/db/prisma";
import { saveUploadedFile } from "@/lib/files/local-file-storage";
import { saveArtworkFile } from "@/lib/files/artwork-storage";
import { requireAdmin } from "@/lib/admin-session";
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
        const relative = await saveArtworkFile(file, order.orderNumber, "original", order.createdAt.getFullYear(), order.createdAt.getMonth() + 1);
        savedArtworkPaths.push(relative);
        await prisma.orderItem.update({ where: { id: item.id }, data: { customerArtworkPath: relative } });
        await prisma.orderFile.create({ data: { orderId: order.id, originalFilename: file.name, storagePath: relative, mimeType: file.type, sizeBytes: file.size } });
      }
    } catch (error) {
      await Promise.all(savedArtworkPaths.map((relative) => rm(path.resolve(process.cwd(), relative), { force: true })));
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
    if (error instanceof Error && error.message === "INSUFFICIENT_STOCK")
      throw new Error("Insufficient stock to approve this order.");
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
    include: { order: true },
  });
  if (!item) throw new Error("ORDER_ITEM_NOT_FOUND");
  const now = new Date();
  const relative = await saveArtworkFile(
    file,
    item.order.orderNumber,
    "original",
    now.getFullYear(),
    now.getMonth() + 1,
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
  const item = await prisma.orderItem.findUnique({ where: { id: orderItemId }, include: { order: true } });
  if (!item) throw new Error("ORDER_ITEM_NOT_FOUND");
  const now = new Date();
  const relative = await saveArtworkFile(file, item.order.orderNumber, "original", now.getFullYear(), now.getMonth() + 1);
  await prisma.orderFile.create({ data: { orderId: item.orderId, originalFilename: file.name, storagePath: relative, mimeType: file.type, sizeBytes: file.size } });
  return relative;
}
export async function saveArtworkExportAction(formData: FormData) {
  const itemId = String(formData.get("orderItemId") ?? "");
  const dataUrl = String(formData.get("dataUrl") ?? "");
  const widthPx = Number(formData.get("widthPx"));
  const heightPx = Number(formData.get("heightPx"));
  const zoom = Number(formData.get("zoom"));
  const rotation = Number(formData.get("rotation"));
  const positionX = Number(formData.get("positionX"));
  const positionY = Number(formData.get("positionY"));
  const item = await prisma.orderItem.findUnique({
    where: { id: itemId },
    include: { order: true, productVariant: { include: { product: { include: { printTemplate: true } } } } },
  });
  const templateDpi = item?.productVariant?.product.printTemplate?.dpi;
  if (
    !item ||
    !/^data:image\/png;base64,/.test(dataUrl) ||
    !Number.isInteger(widthPx) ||
    widthPx < 1 ||
    !Number.isInteger(heightPx) ||
    heightPx < 1 || !Number.isFinite(zoom) || zoom <= 0 ||
    !Number.isFinite(rotation) || !Number.isFinite(positionX) || !Number.isFinite(positionY) ||
    !templateDpi || !Number.isInteger(templateDpi) || templateDpi < 1
  )
    throw new Error("ARTWORK_EXPORT_INVALID");
  if (dataUrl.length > 50 * 1024 * 1024) throw new Error("ARTWORK_EXPORT_TOO_LARGE");
  const folder = path.join(
    process.cwd(),
    "uploads",
    String(new Date().getFullYear()),
    String(new Date().getMonth() + 1).padStart(2, "0"),
    item.order.orderNumber,
    "print-ready",
  );
  try {
    await mkdir(folder, { recursive: true });
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
  try {
    const pngBuffer = Buffer.from(dataUrl.slice("data:image/png;base64,".length), "base64");
    const metadata = await sharp(pngBuffer).metadata();
    if (metadata.width !== widthPx || metadata.height !== heightPx) throw new Error("Export dimensions do not match the print template.");
    const taggedPng = await sharp(pngBuffer).withMetadata({ density: templateDpi }).png().toBuffer();
    await writeFile(
      path.join(folder, filename),
      taggedPng,
      { flag: "wx" },
    );
  } catch (error) {
    console.error("Artwork export file write failed", error);
    throw new Error("Unable to save the print-ready PNG. Check upload folder permissions and available disk space.");
  }
  const relative = path
    .relative(process.cwd(), path.join(folder, filename))
    .replaceAll(path.sep, "/");
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
  const created = await prisma.artworkVersion.create({
    data: {
      projectId: project.id,
      version,
      editedPath: relative,
      printReadyPath: relative,
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
          create: order.items.map((line) => ({
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
export async function permanentlyDeleteTestOrderAction(formData: FormData) {
  const id = orderIdSchema.parse(formData.get("orderId")); const confirmation = String(formData.get("deleteOrderConfirmation") ?? "");
  await requireAdmin();
  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id }, include: { payments: { select: { id: true } }, stockMovements: { select: { id: true } }, items: { include: { stockMovements: { select: { id: true } } } } } });
    if (!order) throw new Error("ORDER_NOT_FOUND");
    const blocked = !order.isTestOrder || order.status !== "Draft" || order.payments.length > 0 || order.stockCommitted || order.stockMovements.length > 0 || order.items.some((item) => item.stockMovements.length > 0) || confirmation !== order.orderNumber;
    await tx.adminAuditLog.create({ data: { action: "permanent_test_order_delete", orderNumber: order.orderNumber, success: !blocked, reason: blocked ? "Eligibility or confirmation check failed" : undefined } });
    if (blocked) throw new Error("TEST_ORDER_DELETE_BLOCKED");
    await tx.orderFile.deleteMany({ where: { orderId: id } });
    await tx.orderItem.deleteMany({ where: { orderId: id } });
    await tx.order.delete({ where: { id } });
  });
  revalidatePath("/orders"); redirect("/orders");
}
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
