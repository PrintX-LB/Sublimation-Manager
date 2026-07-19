import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: "file:../data/sublimation.db",
      },
    },
  });

  const latestSheets = await prisma.printSheet.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  console.log("LATEST SHEETS (DEV DB):");
  for (const s of latestSheets) {
    console.log(`ID: ${s.id}, Filename: ${s.filename}, Mode: ${s.cutMarkMode}, Offset: ${s.cutMarkOffsetMm}, Length: ${s.cutMarkLengthMm}, Thickness: ${s.cutMarkThicknessMm}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
