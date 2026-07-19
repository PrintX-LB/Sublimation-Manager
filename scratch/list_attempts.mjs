import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: "file:../data/sublimation.db", // Try relative to prisma
      },
    },
  });
  const orders = await prisma.order.findMany();
  console.log("Orders count:", orders.length);
  const attempts = await prisma.productionAttempt.findMany();
  console.log("Attempts count:", attempts.length);
}

main();
