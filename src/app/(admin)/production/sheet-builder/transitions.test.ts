import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { generateManualSheetAction } from "./actions";
import { createOrder } from "@/lib/orders/service";
import { writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

describe("Print Sheet Builder Transitions Integration Tests", () => {
  let customerId = "";
  let variantId = "";
  const tempPath = path.resolve(process.cwd(), "uploads", "temp_builder_test.png");

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
    variantId = product.variants[0]!.id;

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

    await prisma.printSheetSlot.deleteMany();
    await prisma.printSheet.deleteMany();
    await prisma.artworkVersion.deleteMany();
    await prisma.artworkProject.deleteMany();
    await prisma.stockMovement.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.productVariant.deleteMany();
    await prisma.product.deleteMany();
    await prisma.customer.deleteMany();
  });

  it("automatically transitions order to Ready to Print on successful sheet builder output generation", async () => {
    const order = await createOrder({
      customerId,
      deliveryMethod: "Collection",
      discountType: "fixed",
      discountValue: "0",
      deliveryCharge: "0",
      items: [{ variantId, quantity: 1, discountType: "fixed", discountValue: "0" }],
    });

    expect(order.status).toBe("draft");
    const item = order.items[0]!;

    const project = await prisma.artworkProject.create({
      data: { orderItemId: item.id, originalPath: "uploads/temp_builder_test.png" },
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

    const result = await generateManualSheetAction(form);

    expect(result.updated).toContain(order.orderNumber);
    expect(result.warnings).toHaveLength(0);

    const updatedOrder = await prisma.order.findUnique({
      where: { id: order.id },
    });
    expect(updatedOrder?.status).toBe("Ready to print");
  });
});
