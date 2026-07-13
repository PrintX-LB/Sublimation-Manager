import { mkdir, readdir, rm, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db/prisma";

const DEFAULT_RETENTION_DAYS = 15;
const settingsPath = () => path.resolve(process.cwd(), "data", "order-storage-settings.json");

export interface OrderStorageSettings { baseFolder: string; retentionDays: number; lastCleanupAt?: string; }

export async function getOrderStorageSettings(): Promise<OrderStorageSettings> {
  try {
    const parsed = JSON.parse(await readFile(settingsPath(), "utf8")) as Partial<OrderStorageSettings>;
    return { baseFolder: parsed.baseFolder || path.resolve(process.cwd(), "uploads"), retentionDays: parsed.retentionDays ?? DEFAULT_RETENTION_DAYS, lastCleanupAt: parsed.lastCleanupAt };
  } catch { return { baseFolder: path.resolve(process.cwd(), "uploads"), retentionDays: DEFAULT_RETENTION_DAYS }; }
}

export async function saveOrderStorageSettings(input: Pick<OrderStorageSettings, "baseFolder" | "retentionDays">) {
  if (!path.isAbsolute(input.baseFolder) || !Number.isInteger(input.retentionDays) || input.retentionDays < 1) throw new Error("INVALID_STORAGE_SETTINGS");
  await mkdir(path.dirname(settingsPath()), { recursive: true });
  await writeFile(settingsPath(), JSON.stringify(input, null, 2), "utf8");
}

export function sanitizeOrderFolderName(orderNumber: string, customerName?: string) {
  const safeName = (customerName ?? "").trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/[ .]+$/g, "");
  return safeName ? `${orderNumber} - ${safeName}` : orderNumber;
}

export async function ensureOrderFolder(orderNumber: string, customerName?: string, baseFolder?: string) {
  const root = path.resolve(baseFolder ?? (await getOrderStorageSettings()).baseFolder);
  const folder = path.resolve(root, sanitizeOrderFolderName(orderNumber, customerName));
  if (!folder.startsWith(`${root}${path.sep}`)) throw new Error("INVALID_ORDER_STORAGE_PATH");
  await Promise.all(["originals", "exports", "attachments"].map((name) => mkdir(path.join(folder, name), { recursive: true })));
  return folder;
}

export async function runOrderStorageCleanup() {
  const settings = await getOrderStorageSettings();
  const now = Date.now();
  if (settings.lastCleanupAt && now - new Date(settings.lastCleanupAt).getTime() < 24 * 60 * 60 * 1000) return { skipped: true, foldersDeleted: 0, filesDeleted: 0 };
  const cutoff = new Date(now - settings.retentionDays * 24 * 60 * 60 * 1000);
  const orders = await prisma.order.findMany({ where: { status: { in: ["Completed", "Delivered", "Cancelled", "completed", "delivered", "cancelled"] }, updatedAt: { lte: cutoff } }, select: { orderNumber: true, customer: { select: { fullName: true } } } });
  const root = path.resolve(settings.baseFolder);
  let foldersDeleted = 0; let filesDeleted = 0;
  for (const order of orders) {
    const folder = path.resolve(root, sanitizeOrderFolderName(order.orderNumber, order.customer.fullName));
    if (!folder.startsWith(`${root}${path.sep}`)) continue;
    try {
      const entries = await readdir(folder, { withFileTypes: true });
      for (const entry of entries) {
        const target = path.resolve(folder, entry.name);
        if (!target.startsWith(`${root}${path.sep}`)) continue;
        if (entry.isDirectory()) {
          const files = await readdir(target);
          await rm(target, { recursive: true, force: true }); filesDeleted += files.length;
        } else { await rm(target, { force: true }); filesDeleted += 1; }
      }
      await rm(folder, { recursive: true, force: true }); foldersDeleted += 1;
    } catch (error) { console.error("Order retention cleanup failed", order.orderNumber, error); }
  }
  await saveOrderStorageSettings({ baseFolder: settings.baseFolder, retentionDays: settings.retentionDays });
  await writeFile(settingsPath(), JSON.stringify({ ...settings, lastCleanupAt: new Date().toISOString() }, null, 2), "utf8");
  return { skipped: false, foldersDeleted, filesDeleted };
}
