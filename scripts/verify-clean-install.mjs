import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const root = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\//, ""));
const command = process.execPath;
const prismaCli = path.join(root, "node_modules", "prisma", "build", "index.js");
const portablePath = (value) => value.replace(/^\\\\\?\\/, "");

function run(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [prismaCli, ...args], { cwd: root, env, stdio: "inherit", windowsHide: true });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed (${code ?? signal}): ${command} ${args.join(" ")}`));
    });
  });
}

async function verifyOnce() {
  const workspace = await mkdir(path.join(os.tmpdir(), `printx-clean-${Date.now()}-${Math.random().toString(16).slice(2)}`), { recursive: true });
  const dbPath = path.join(workspace, "sublimation.db");
  const storageRoot = path.join(workspace, "storage");
  const sheetsRoot = path.join(workspace, "sheets");
  const env = { ...process.env, DATABASE_URL: `file:${portablePath(dbPath).replaceAll("\\", "/")}`, PRINTX_STORAGE_SETTINGS_PATH: path.join(workspace, "order-storage-settings.json"), PRINTX_BACKUP_SETTINGS_PATH: path.join(workspace, "backup-settings-history.json") };
  try {
    await writeFile(dbPath, Buffer.alloc(0));
    console.log(`Clean migration database: ${dbPath}`);
    await run(["migrate", "deploy"], env);

    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
    try {
      const categories = await prisma.productCategory.findMany({ select: { name: true }, orderBy: { name: "asc" } });
      const expected = ["Clothing", "Drinkware", "Home & Gifts", "Office & Accessories", "Other"];
      if (categories.length !== expected.length || categories.some((category, index) => category.name !== expected[index])) throw new Error(`Standard category integrity failed: ${categories.map((category) => category.name).join(", ")}`);
      if (await prisma.customer.count() !== 0 || await prisma.order.count() !== 0) throw new Error("Fresh database contains development data.");

      await mkdir(storageRoot, { recursive: true });
      await mkdir(sheetsRoot, { recursive: true });
      const customer = await prisma.customer.create({ data: { customerNumber: "QA-CLEAN-000001", fullName: "Clean Install Customer" } });
      const order = await prisma.order.create({ data: { orderNumber: "QA-CLEAN-000001", customerId: customer.id } });
      if (order.customerId !== customer.id) throw new Error("Fresh database customer/order relationship failed.");
      await prisma.order.delete({ where: { id: order.id } });
      await prisma.customer.delete({ where: { id: customer.id } });
      if (await prisma.customer.count() !== 0 || await prisma.order.count() !== 0) throw new Error("Clean integrity records were not removed.");
    } finally {
      await prisma.$disconnect();
    }
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

try {
  await run(["generate"], { ...process.env, DATABASE_URL: process.env.DATABASE_URL ?? "file:../data/sublimation.db" });
  const repetitions = process.argv.includes("--repeat") ? 2 : 1;
  for (let index = 0; index < repetitions; index += 1) {
    console.log(`Clean-install verification ${index + 1}/${repetitions}`);
    await verifyOnce();
  }
  console.log("Clean-install verification passed.");
} catch (error) {
  console.error("Clean-install verification failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
