import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: "file:../.next/standalone/data/sublimation.db",
      },
    },
  });

  const orders = await prisma.order.count();
  const orderItems = await prisma.orderItem.count();
  const attempts = await prisma.productionAttempt.count();
  const sheets = await prisma.printSheet.count();
  const slots = await prisma.printSheetSlot.count();
  const versions = await prisma.artworkVersion.count();

  console.log(`STANDALONE DATABASE TABLE COUNTS:`);
  console.log(`Orders: ${orders}`);
  console.log(`OrderItems: ${orderItems}`);
  console.log(`Attempts: ${attempts}`);
  console.log(`PrintSheets: ${sheets}`);
  console.log(`PrintSheetSlots: ${slots}`);
  console.log(`ArtworkVersions: ${versions}`);

  if (sheets > 0) {
    const list = await prisma.printSheet.findMany({ take: 5, include: { slots: true } });
    console.log("SHEETS DETAILED:");
    console.log(JSON.stringify(list, null, 2));
  }

  await prisma.$disconnect();
}

main().catch(console.error);
