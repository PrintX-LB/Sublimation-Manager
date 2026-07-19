import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: "file:C:/Users/tonyn/AppData/Local/PrintX/database/printx.db",
      },
    },
  });

  const projects = await prisma.artworkProject.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  console.log("ARTWORK PROJECTS:");
  for (const p of projects) {
    console.log(`ID: ${p.id}, OriginalPath: ${p.originalPath}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
