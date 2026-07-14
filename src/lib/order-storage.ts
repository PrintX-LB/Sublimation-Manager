import { lstat, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db/prisma";

const DEFAULT_RETENTION_DAYS = 15;
const DAY_MS = 24 * 60 * 60 * 1000;
const settingsPath = () => {
  if (process.env.VITEST) {
    const poolId = process.env.VITEST_POOL_ID || "1";
    return path.resolve(process.cwd(), "data", `order-storage-settings-test-${poolId}.json`);
  }
  return path.resolve(process.cwd(), "data", "order-storage-settings.json");
};

export interface OrderStorageSettings {
  baseFolder: string;
  printSheetFolder: string;
  retentionDays: number;
  lastCleanupAt?: string;
}

export interface CleanupResult {
  skipped: boolean;
  ordersChecked: number;
  eligibleOrders: number;
  foldersDeleted: number;
  filesDeleted: number;
  skippedOrders: number;
  errors: number;
  skippedReasons: string[];
}

function normaliseRetentionDays(value: unknown): number {
  const days = typeof value === "number" ? value : Number(value);
  return Number.isInteger(days) && days >= 1 ? days : DEFAULT_RETENTION_DAYS;
}

export async function getOrderStorageSettings(): Promise<OrderStorageSettings> {
  try {
    const parsed = JSON.parse(await readFile(settingsPath(), "utf8")) as Partial<OrderStorageSettings>;
    return {
      baseFolder: typeof parsed.baseFolder === "string" && parsed.baseFolder.trim() ? path.resolve(parsed.baseFolder.trim()) : path.resolve(process.cwd(), "uploads"),
      printSheetFolder: typeof parsed.printSheetFolder === "string" && parsed.printSheetFolder.trim() ? path.resolve(parsed.printSheetFolder.trim()) : path.resolve(process.cwd(), "print-sheets"),
      retentionDays: normaliseRetentionDays(parsed.retentionDays),
      lastCleanupAt: typeof parsed.lastCleanupAt === "string" ? parsed.lastCleanupAt : undefined,
    };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return {
        baseFolder: path.resolve(process.cwd(), "uploads"),
        printSheetFolder: path.resolve(process.cwd(), "print-sheets"),
        retentionDays: DEFAULT_RETENTION_DAYS
      };
    }
    throw new Error("ORDER_STORAGE_SETTINGS_INVALID", { cause: error });
  }
}

export async function saveOrderStorageSettings(input: Pick<OrderStorageSettings, "baseFolder" | "printSheetFolder" | "retentionDays">) {
  const baseFolder = input.baseFolder.trim();
  const printSheetFolder = input.printSheetFolder.trim();
  if (!path.isAbsolute(baseFolder) || !path.isAbsolute(printSheetFolder) || !Number.isInteger(input.retentionDays) || input.retentionDays < 1) {
    throw new Error("INVALID_STORAGE_SETTINGS");
  }
  await mkdir(path.dirname(settingsPath()), { recursive: true });
  await writeFile(
    settingsPath(),
    JSON.stringify({
      baseFolder: path.resolve(baseFolder),
      printSheetFolder: path.resolve(printSheetFolder),
      retentionDays: input.retentionDays
    }, null, 2),
    "utf8"
  );
}

export async function getOrderFilesBaseFolder(): Promise<string> {
  const settings = await getOrderStorageSettings();
  return settings.baseFolder;
}

export async function getPrintSheetBuilderFolder(): Promise<string> {
  const settings = await getOrderStorageSettings();
  return settings.printSheetFolder;
}

export function sanitizeOrderFolderName(orderNumber: string, customerName?: string) {
  const safeName = (customerName ?? "").trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/[ .]+$/g, "");
  return safeName ? `${orderNumber} - ${safeName}` : orderNumber;
}

export async function ensureOrderFolder(orderNumber: string, customerName?: string, baseFolder?: string) {
  const root = path.resolve(baseFolder ?? (await getOrderStorageSettings()).baseFolder);
  const folder = path.resolve(root, sanitizeOrderFolderName(orderNumber, customerName));
  if (!isSafeChild(root, folder)) throw new Error("INVALID_ORDER_STORAGE_PATH");
  await Promise.all(["originals", "exports", "attachments"].map((name) => mkdir(path.join(folder, name), { recursive: true })));
  return folder;
}

function isSafeChild(root: string, candidate: string): boolean {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  return resolvedCandidate !== resolvedRoot && resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`);
}

function resolveStoredPath(storedPath: string, root: string): string | null {
  const normalised = storedPath.replaceAll("/", path.sep);
  const candidate = normalised.startsWith(`uploads${path.sep}`)
    ? path.resolve(process.cwd(), normalised)
    : path.resolve(root, normalised);
  const uploadRoot = path.resolve(process.cwd(), "uploads");
  if (isSafeChild(root, candidate) || isSafeChild(uploadRoot, candidate)) return candidate;
  return null;
}

function findOrderFolder(storedPath: string, orderNumber: string, root: string): string | null {
  const resolved = resolveStoredPath(storedPath, root);
  if (!resolved) return null;
  let current = path.dirname(resolved);
  const allowedRoots = [path.resolve(root), path.resolve(process.cwd(), "uploads")];
  while (allowedRoots.some((allowed) => isSafeChild(allowed, current))) {
    if (path.basename(current) === orderNumber) return current;
    current = path.dirname(current);
  }
  return null;
}

async function removeDirectory(directory: string): Promise<{ files: number; existed: boolean }> {
  let files = 0;
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        files += (await removeDirectory(target)).files;
      } else {
        const info = await lstat(target);
        if (info.isFile()) files += 1;
      }
    }
    await rm(directory, { recursive: true, force: true });
    return { files, existed: true };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return { files: 0, existed: false };
    throw error;
  }
}

export function finalDateFor(order: { status: string; finalStatusAt: Date | null; completedAt: Date | null; deliveredAt?: Date | null; cancelledAt?: Date | null }): Date | null {
  if (order.finalStatusAt) return order.finalStatusAt;
  if (order.status === "Completed" && order.completedAt) return order.completedAt;
  if (order.status === "Delivered" && order.deliveredAt) return order.deliveredAt;
  if (order.status === "Cancelled" && order.cancelledAt) return order.cancelledAt;
  return null;
}

export async function runOrderStorageCleanup(force = false): Promise<CleanupResult> {
  const settings = await getOrderStorageSettings();
  const now = Date.now();
  if (!force && settings.lastCleanupAt && now - new Date(settings.lastCleanupAt).getTime() < DAY_MS) {
    return { skipped: true, ordersChecked: 0, eligibleOrders: 0, foldersDeleted: 0, filesDeleted: 0, skippedOrders: 0, errors: 0, skippedReasons: ["Cleanup already ran today"] };
  }
  const orders = await prisma.order.findMany({
    where: { status: { in: ["Completed", "Delivered", "Cancelled"] } },
    select: { id: true, orderNumber: true, status: true, finalStatusAt: true, completedAt: true, deliveredAt: true, cancelledAt: true, retainFilesPermanently: true, retentionExtendedUntil: true, customer: { select: { fullName: true } }, files: { select: { id: true, storagePath: true } } },
  });
  const cutoff = new Date(now - settings.retentionDays * DAY_MS);
  const root = path.resolve(settings.baseFolder);
  const result: CleanupResult = { skipped: false, ordersChecked: orders.length, eligibleOrders: 0, foldersDeleted: 0, filesDeleted: 0, skippedOrders: 0, errors: 0, skippedReasons: [] };
  for (const order of orders) {
    const finalDate = finalDateFor(order);
    const reason = order.retainFilesPermanently ? "Order marked Keep Permanently" : order.retentionExtendedUntil && order.retentionExtendedUntil > new Date() ? "Retention period extended" : !finalDate ? "Missing final-status timestamp" : finalDate > cutoff ? "Retention period not reached" : null;
    if (reason) {
      result.skippedOrders += 1;
      result.skippedReasons.push(`${order.orderNumber}: ${reason}`);
      if (process.env.NODE_ENV === "development") console.info("[order-storage] skipped", { orderNumber: order.orderNumber, status: order.status, finalDate: finalDate?.toISOString() ?? null, deletionDate: finalDate ? new Date(finalDate.getTime() + settings.retentionDays * DAY_MS).toISOString() : null, eligible: false, reason });
      continue;
    }
    result.eligibleOrders += 1;
    try {
      const candidates = new Set<string>();
      for (const file of order.files) {
        const folder = findOrderFolder(file.storagePath, order.orderNumber, root);
        if (folder) candidates.add(folder);
      }
      const legacy = path.resolve(root, sanitizeOrderFolderName(order.orderNumber, order.customer.fullName));
      if (isSafeChild(root, legacy)) candidates.add(legacy);
      let deletedFiles = 0;
      let deletedFolder = false;
      let deletedFolderCount = 0;
      for (const folder of candidates) {
        const removed = await removeDirectory(folder);
        if (removed.existed) { deletedFolder = true; deletedFolderCount += 1; deletedFiles += removed.files; }
      }
      if (!deletedFolder) {
        result.skippedOrders += 1;
        result.skippedReasons.push(`${order.orderNumber}: Folder not found`);
        continue;
      }
      result.foldersDeleted += deletedFolderCount;
      result.filesDeleted += deletedFiles;
      await prisma.$transaction(async (tx) => {
        if (order.files.length) await tx.orderFile.updateMany({ where: { id: { in: order.files.map((file) => file.id) } }, data: { deletedAt: new Date() } });
        await tx.order.update({ where: { id: order.id }, data: { filesDeletedAt: new Date() } });
      });
      if (process.env.NODE_ENV === "development") console.info("[order-storage] eligible", { orderNumber: order.orderNumber, status: order.status, finalDate: finalDate?.toISOString(), deletionDate: new Date(finalDate!.getTime() + settings.retentionDays * DAY_MS).toISOString(), eligible: true });
    } catch (error) {
      result.errors += 1;
      result.skippedReasons.push(`${order.orderNumber}: ${error instanceof Error ? error.message : "File access failed"}`);
      console.error("Order retention cleanup failed", order.orderNumber, error);
    }
  }
  await writeFile(settingsPath(), JSON.stringify({ ...settings, lastCleanupAt: new Date().toISOString() }, null, 2), "utf8");
  return result;
}
