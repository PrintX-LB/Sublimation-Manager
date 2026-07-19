import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: "file:C:/Users/tonyn/AppData/Local/PrintX/database/printx.db",
      },
    },
  });

  const versions = await prisma.artworkVersion.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  console.log("ARTWORK VERSIONS:");
  for (const v of versions) {
    console.log(`ID: ${v.id}, edited: ${v.editedPath}, printReady: ${v.printReadyPath}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
