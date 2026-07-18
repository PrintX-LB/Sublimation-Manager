import { PrismaClient } from "@prisma/client";

const db = process.argv[2];
if (!db) throw new Error("Usage: node scripts/audit-sqlite.mjs <database>");
const prisma = new PrismaClient({ datasources: { db: { url: `file:${db}` } } });
try {
  const tables = await prisma.$queryRawUnsafe(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
  );
  for (const { name } of tables) {
    const [{ count }] = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS count FROM "${name.replaceAll('"', '""')}"`);
    console.log(`${name}\t${count}`);
  }
} finally {
  await prisma.$disconnect();
}
