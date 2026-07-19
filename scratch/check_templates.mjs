import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: "file:C:/Users/tonyn/AppData/Local/PrintX/database/printx.db",
      },
    },
  });

  const templates = await prisma.printTemplate.findMany();
  console.log("TEMPLATES:");
  for (const t of templates) {
    console.log(`ID: ${t.id}, Name: ${t.name}, CutMarkMode: ${t.cutMarkMode}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
