import { lstat, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db/prisma";

const DEFAULT_RETENTION_DAYS = 15;
const settingsPath = () => path.resolve(process.cwd(), "data", "order-storage-settings.json");

export interface OrderStorageSettings {
  baseFolder: string;
  retentionDays: number;
  lastCleanupAt?: string;
}

export async function getOrderStorageSettings(): Promise<OrderStorageSettings> {
  try {
    const parsed = JSON.parse(await readFile(settingsPath(), "utf8")) as Partial<OrderStorageSettings>;
    return {
      baseFolder: parsed.baseFolder || path.resolve(process.cwd(), "uploads"),
      retentionDays: parsed.retentionDays ?? DEFAULT_RETENTION_DAYS,
      lastCleanupAt: parsed.lastCleanupAt,
    };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { baseFolder: path.resolve(process.cwd(), "uploads"), retentionDays: DEFAULT_RETENTION_DAYS };
    }
    throw new Error("ORDER_STORAGE_SETTINGS_INVALID", { cause: error });
  }
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

function resolveStoredPath(storedPath: string, root: string) {
  const candidate = storedPath.startsWith("uploads/") || storedPath.startsWith("uploads\\")
    ? path.resolve(process.cwd(), storedPath)
    : path.resolve(root, storedPath);
  const allowedRoots = [root, path.resolve(process.cwd(), "uploads")];
  if (!allowedRoots.some((allowed) => candidate === allowed || candidate.startsWith(`${allowed}${path.sep}`))) return null;
  return candidate;
}

async function removeFile(filePath: string) {
  try {
    const info = await lstat(filePath);
    if (!info.isFile()) return 0;
    await rm(filePath, { force: true });
    return 1;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return 0;
    throw error;
  }
}

async function removeDirectory(directory: string) {
  let count = 0;
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const target = path.join(directory, entry.name);
      count += entry.isDirectory() ? await removeDirectory(target) : await removeFile(target);
    }
    await rm(directory, { recursive: true, force: true });
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  return count;
}

export async function runOrderStorageCleanup(force = false) {
  const settings = await getOrderStorageSettings();
  const now = Date.now();
  if (!force && settings.lastCleanupAt && now - new Date(settings.lastCleanupAt).getTime() < 24 * 60 * 60 * 1000) return { skipped: true, foldersDeleted: 0, filesDeleted: 0 };
  const cutoff = new Date(now - settings.retentionDays * 24 * 60 * 60 * 1000);
  const orders = await prisma.order.findMany({
    where: { status: { in: ["Completed", "Delivered", "Cancelled", "completed", "delivered", "cancelled"] }, updatedAt: { lte: cutoff } },
    select: {
      id: true,
      orderNumber: true,
      customer: { select: { fullName: true } },
      items: { select: { customerArtworkPath: true, printReadyArtworkPath: true, artworkProject: { select: { originalPath: true, versions: { select: { editedPath: true, printReadyPath: true } } } } } },
      files: { select: { id: true, storagePath: true } },
    },
  });
  const root = path.resolve(settings.baseFolder);
  let foldersDeleted = 0;
  let filesDeleted = 0;
  for (const order of orders) {
    try {
      const paths = new Set<string>();
      for (const item of order.items) {
        if (item.customerArtworkPath) paths.add(item.customerArtworkPath);
        if (item.printReadyArtworkPath) paths.add(item.printReadyArtworkPath);
        if (item.artworkProject) {
          paths.add(item.artworkProject.originalPath);
          for (const version of item.artworkProject.versions) paths.add(version.editedPath).add(version.printReadyPath);
        }
      }
      for (const file of order.files) paths.add(file.storagePath);
      for (const storedPath of paths) {
        const resolved = resolveStoredPath(storedPath, root);
        if (resolved) filesDeleted += await removeFile(resolved);
      }
      const legacyFolder = path.resolve(root, sanitizeOrderFolderName(order.orderNumber, order.customer.fullName));
      if (legacyFolder.startsWith(`${root}${path.sep}`)) {
        const removed = await removeDirectory(legacyFolder);
        if (removed > 0) foldersDeleted += 1;
        filesDeleted += removed;
      }
      if (order.files.length > 0) await prisma.orderFile.updateMany({ where: { id: { in: order.files.map((file) => file.id) } }, data: { deletedAt: new Date() } });
    } catch (error) {
      console.error("Order retention cleanup failed", order.orderNumber, error);
    }
  }
  await writeFile(settingsPath(), JSON.stringify({ ...settings, lastCleanupAt: new Date().toISOString() }, null, 2), "utf8");
  return { skipped: false, foldersDeleted, filesDeleted };
}
