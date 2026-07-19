import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: "file:C:/Users/tonyn/AppData/Local/PrintX/database/printx.db",
      },
    },
  });

  const schema = await prisma.$queryRawUnsafe(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='PrintSheetSlot'"
  );
  console.log("TABLE SCHEMA:");
  console.log(schema);

  const indexes = await prisma.$queryRawUnsafe(
    "SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='PrintSheetSlot'"
  );
  console.log("\nINDEXES:");
  console.log(indexes);

  await prisma.$disconnect();
}

main().catch(console.error);
