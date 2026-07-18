import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { generateManualSheetAction } from "./actions";
import { generateQueueSheetAction } from "../sheets/queue/actions";
import { createOrder } from "@/lib/orders/service";
import { writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

describe("Print Sheet Builder Transitions Integration Tests", () => {
  let customerId = "";
  let categoryId = "";
  let productId = "";
  let variantId = "";
  let paperId = "";
  let orderId = "";
  const sheetIds: string[] = [];
  const tempPath = path.resolve(
    process.cwd(),
    "uploads",
    "temp_builder_test.png",
  );

  beforeAll(async () => {
    // 1. Create uploads folder if missing, and write a dummy 300DPI 2480x1122 PNG canvas for sharp processing
    await mkdir(path.dirname(tempPath), { recursive: true });
    const dummyImage = await sharp({
      create: {
        width: 2480,
        height: 1122,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    await writeFile(tempPath, dummyImage);

    const category = await prisma.productCategory.create({
      data: { name: `Builder Test Category-${Date.now()}` },
    });
    categoryId = category.id;

    const product = await prisma.product.create({
      data: {
        name: "Builder Test Product",
        categoryId: category.id,
        variants: {
          create: {
            name: "Standard",
            sku: `BUILDER-${Date.now()}`,
            sellingPrice: "10.00",
            productionCost: "5.00",
            stockQuantity: "100.00",
          },
        },
      },
      include: { variants: true },
    });
    productId = product.id;
    variantId = product.variants[0]!.id;

    const paper = await prisma.inventoryItem.create({
      data: {
        name: `A4 Paper-${Date.now()}`,
        inventoryType: "PRINT_MEDIA",
        baseUnit: "SHEET",
        currentQuantity: "10",
        minimumQuantity: "1",
        unitCost: "0.50",
      },
    });
    paperId = paper.id;
    await prisma.productionRecipe.create({
      data: {
        productVariantId: variantId,
        name: "A4 print recipe",
        items: {
          create: {
            inventoryItemId: paper.id,
            quantity: "1",
            unit: "SHEET",
            materialRole: "PRINT_MEDIA",
            consumptionStage: "PRINT_SHEET_GENERATION",
          },
        },
      },
    });

    const customer = await prisma.customer.create({
      data: {
        customerNumber: `BUILDER-${Date.now()}`,
        fullName: "Transition Customer",
      },
    });
    customerId = customer.id;
  });

  afterAll(async () => {
    await rm(tempPath, { force: true });

    await prisma.printSheetSlot.deleteMany({
      where: { sheetId: { in: sheetIds } },
    });
    await prisma.inventoryTransaction.deleteMany({
      where: { inventoryItemId: paperId },
    });
    await prisma.productionMaterialConsumption.deleteMany({
      where: {
        OR: [
          { recipeItem: { inventoryItemId: paperId } },
          { printSheetId: { in: sheetIds } },
        ],
      },
    });
    await prisma.printSheet.deleteMany({ where: { id: { in: sheetIds } } });
    await prisma.artworkVersion.deleteMany({
      where: { project: { orderItem: { orderId } } },
    });
    await prisma.artworkProject.deleteMany({
      where: { orderItem: { orderId } },
    });
    await prisma.stockMovement.deleteMany({ where: { orderId } });
    await prisma.payment.deleteMany({ where: { orderId } });
    await prisma.orderItem.deleteMany({ where: { orderId } });
    await prisma.order.deleteMany({ where: { id: orderId } });
    await prisma.productionRecipeItem.deleteMany({
      where: { inventoryItemId: paperId },
    });
    await prisma.productionRecipe.deleteMany({
      where: { productVariantId: variantId },
    });
    await prisma.inventoryItem.deleteMany({ where: { id: paperId } });
    await prisma.productVariant.deleteMany({ where: { id: variantId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.productCategory.deleteMany({ where: { id: categoryId } });
    await prisma.customer.deleteMany({ where: { id: customerId } });
  });

  it("automatically transitions order to Ready to Print on successful sheet builder output generation", async () => {
    const order = await createOrder({
      customerId,
      deliveryMethod: "Collection",
      discountType: "fixed",
      discountValue: "0",
      deliveryCharge: "0",
      items: [
        { variantId, quantity: 1, discountType: "fixed", discountValue: "0" },
      ],
    });
    orderId = order.id;

    expect(order.status).toBe("Draft");
    const item = order.items[0]!;

    const project = await prisma.artworkProject.create({
      data: {
        orderItemId: item.id,
        originalPath: "uploads/temp_builder_test.png",
      },
    });

    const version = await prisma.artworkVersion.create({
      data: {
        projectId: project.id,
        version: 1,
        widthPx: 2480,
        heightPx: 1122,
        editedPath: "uploads/temp_builder_test.png",
        printReadyPath: "uploads/temp_builder_test.png",
      },
    });

    const form = new FormData();
    form.set("slot1", version.id);
    form.set("slot2", version.id);
    form.set("includeStrips", "off");
    form.set("includeContour", "off");
    form.set("filename", "A4_trans_test.png");
    form.set("generationRequestKey", `two-slot-${Date.now()}`);

    const result = await generateManualSheetAction(form);
    sheetIds.push(result.sheetId);

    expect(result.updated).toContain(order.orderNumber);
    expect(result.warnings).toHaveLength(0);

    const paperAfterTwoSlot = await prisma.inventoryItem.findUniqueOrThrow({
      where: { id: paperId },
    });
    expect(paperAfterTwoSlot.currentQuantity.toString()).toBe("9");
    const costAfterTwoSlot = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(costAfterTwoSlot.actualProductionCost.toString()).toBe("0.5");
    const paperConsumptions =
      await prisma.productionMaterialConsumption.findMany({
        where: {
          printSheetId: result.sheetId,
          materialRoleSnapshot: "PRINT_MEDIA",
        },
        include: { inventoryTransaction: true },
      });
    expect(paperConsumptions).toHaveLength(1);
    expect(paperConsumptions[0]?.quantity.toString()).toBe("1");
    expect(
      paperConsumptions[0]?.inventoryTransaction?.quantityChange.toString(),
    ).toBe("-1");

    const repeated = await generateManualSheetAction(form);
    expect(repeated.sheetId).toBe(result.sheetId);
    const paperAfterRetry = await prisma.inventoryItem.findUniqueOrThrow({
      where: { id: paperId },
    });
    expect(paperAfterRetry.currentQuantity.toString()).toBe("9");

    const oneSlotForm = new FormData();
    oneSlotForm.set("slot1", version.id);
    oneSlotForm.set("includeStrips", "off");
    oneSlotForm.set("includeContour", "off");
    oneSlotForm.set("filename", "A4_one_slot_test.png");
    oneSlotForm.set("generationRequestKey", `one-slot-${Date.now()}`);
    const oneSlotResult = await generateManualSheetAction(oneSlotForm);
    sheetIds.push(oneSlotResult.sheetId);
    const paperAfterOneSlot = await prisma.inventoryItem.findUniqueOrThrow({
      where: { id: paperId },
    });
    expect(paperAfterOneSlot.currentQuantity.toString()).toBe("8");

    const sheetCountBeforeShortage = await prisma.printSheet.count();
    await prisma.inventoryItem.update({
      where: { id: paperId },
      data: { currentQuantity: "0" },
    });
    const insufficientForm = new FormData();
    insufficientForm.set("slot1", version.id);
    insufficientForm.set("includeStrips", "off");
    insufficientForm.set("includeContour", "off");
    insufficientForm.set("filename", "A4_insufficient_test.png");
    insufficientForm.set("generationRequestKey", `insufficient-${Date.now()}`);
    await expect(generateManualSheetAction(insufficientForm)).rejects.toThrow(
      "INSUFFICIENT_PRINT_MEDIA",
    );
    expect(await prisma.printSheet.count()).toBe(sheetCountBeforeShortage);
    const paperAfterRejectedGeneration =
      await prisma.inventoryItem.findUniqueOrThrow({ where: { id: paperId } });
    expect(paperAfterRejectedGeneration.currentQuantity.toString()).toBe("0");

    const updatedOrder = await prisma.order.findUnique({
      where: { id: order.id },
    });
    expect(updatedOrder?.status).toBe("Ready to print");

    const attempt = await prisma.productionAttempt.findFirstOrThrow({
      where: { orderItemId: item.id },
    });
    await prisma.inventoryItem.update({ where: { id: paperId }, data: { currentQuantity: "1" } });
    const automaticForm = new FormData();
    automaticForm.set("attempt1", attempt.id);
    automaticForm.set("generationRequestKey", `automatic-${Date.now()}`);
    const beforeAutomatic = await prisma.printSheet.count();
    try {
      await generateQueueSheetAction(automaticForm);
    } catch (error) {
      // Server actions redirect after a successful generation.
      expect(String(error)).toContain("NEXT_REDIRECT");
    }
    expect(await prisma.printSheet.count()).toBe(beforeAutomatic + 1);
    const automaticSheet = await prisma.printSheet.findFirstOrThrow({
      orderBy: { createdAt: "desc" },
      include: { slots: true },
    });
    sheetIds.push(automaticSheet.id);
    expect(automaticSheet.slots).toHaveLength(1);
  });
});
