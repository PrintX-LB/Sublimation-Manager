import { copyFile, mkdir, readdir, stat, readFile, writeFile, rm, rename } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import { prisma } from "@/lib/db/prisma";
import { getOrderStorageSettings, saveOrderStorageSettings } from "@/lib/order-storage";
import { PrismaClient } from "@prisma/client";
import { ADMIN_CREDENTIAL_SETTING_KEYS } from "@/lib/admin-credentials";
const require = createRequire(import.meta.url);
const AdmZip = require("adm-zip") as typeof import("adm-zip");
const execFile = promisify(execFileCallback);
type AdmZipInstance = InstanceType<typeof AdmZip>;
type ZipEntry = ReturnType<AdmZipInstance["getEntry"]>;
const SUPPORTED_BACKUP_VERSION = "1.0.0";
let restoreInProgress = false;

// Types
export interface BackupSettings {
  schedule: "disabled" | "daily" | "weekly" | "monthly";
  lastBackupAt?: string;
  nextScheduledAt?: string;
  keepMinCount: number;
}

export interface BackupHistoryEntry {
  id: string;
  filename: string;
  filePath: string;
  timestamp: string;
  sizeBytes: number;
  fileCount: number;
  type: "manual" | "scheduled";
  status: "success" | "failed";
  errorMessage?: string;
  isPinned: boolean;
}

export interface BackupManifest {
  version: string;
  createdAt: string;
  databaseChecksum: string;
  files: {
    type: "orders" | "sheets";
    relativePath: string;
    size: number;
    checksum: string;
  }[];
  schemaMigrations: string[];
}

const DEFAULT_SETTINGS: BackupSettings = {
  schedule: "disabled",
  keepMinCount: 5,
};

const settingsPath = () => {
  if (process.env.PRINTX_BACKUP_SETTINGS_PATH) {
    return path.resolve(process.env.PRINTX_BACKUP_SETTINGS_PATH);
  }
  if (process.env.VITEST) {
    const poolId = process.env.VITEST_POOL_ID || "1";
    return path.resolve(process.cwd(), "data", `backup-settings-history-test-${poolId}.json`);
  }
  return path.resolve(process.cwd(), "data", "backup-settings-history.json");
};

const backupRootPath = () => {
  if (process.env.PRINTX_BACKUP_ROOT) {
    return path.resolve(process.env.PRINTX_BACKUP_ROOT);
  }
  return path.resolve(process.cwd(), "data", "backups");
};

export function activeDatabasePath(): string {
  const explicitPath = process.env.PRINTX_DATABASE_PATH?.trim();
  if (explicitPath) return path.resolve(explicitPath);

  const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
  if (!databaseUrl.startsWith("file:")) {
    return path.resolve(process.cwd(), "data", "sublimation.db");
  }
  const rawPath = decodeURIComponent(databaseUrl.slice("file:".length).split("?")[0] ?? "");
  const windowsPath = rawPath.match(/^\/?[A-Za-z]:[\\/]/) ? rawPath.replace(/^\//, "") : null;
  if (windowsPath) return path.resolve(windowsPath);
  if (path.isAbsolute(rawPath)) return path.resolve(rawPath);
  // Prisma resolves a relative SQLite URL from the directory containing schema.prisma.
  return path.resolve(process.cwd(), "prisma", rawPath);
}

const activeStorageSettingsPath = () => process.env.PRINTX_STORAGE_SETTINGS_PATH
  ? path.resolve(process.env.PRINTX_STORAGE_SETTINGS_PATH)
  : path.resolve(process.cwd(), "data", "order-storage-settings.json");

// Helper: Checksum
export function calculateChecksum(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function calculateFileChecksum(filePath: string): Promise<string> {
  const data = await readFile(filePath);
  return calculateChecksum(data);
}

async function openArchiveWhenReady(archivePath: string): Promise<AdmZipInstance> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const zip = new AdmZip(await readFile(archivePath));
      const manifest = zip.getEntry("backup-manifest.json");
      if (manifest && (await readZipEntry(zip, manifest))?.length) return zip;
      lastError = new Error("Backup archive is still being flushed.");
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw lastError instanceof Error ? lastError : new Error("Backup archive could not be read.");
}

function readZipEntry(zip: AdmZipInstance, entry: ZipEntry): Promise<Buffer | null> {
  return new Promise((resolve) => {
    if (!entry) return resolve(null);
    zip.readFileAsync(entry, (data: Buffer | null) => resolve(data));
  });
}

async function extractArchiveWithSystemTar(archivePath: string, destination: string): Promise<void> {
  await mkdir(destination, { recursive: true });
  await execFile("tar", ["-xf", archivePath, "-C", destination]);
}

// Helpers: Settings & History DB
export async function getBackupData(): Promise<{ settings: BackupSettings; history: BackupHistoryEntry[] }> {
  try {
    const data = await readFile(settingsPath(), "utf8");
    const parsed = JSON.parse(data);
    return {
      settings: normaliseBackupSettings(parsed.settings),
      history: Array.isArray(parsed.history) ? parsed.history : [],
    };
  } catch {
    return {
      settings: { ...DEFAULT_SETTINGS },
      history: [],
    };
  }
}

function normaliseBackupSettings(value: unknown): BackupSettings {
  const candidate = value && typeof value === "object" ? value as Partial<BackupSettings> : {};
  const schedules: BackupSettings["schedule"][] = ["disabled", "daily", "weekly", "monthly"];
  const schedule = schedules.includes(candidate.schedule as BackupSettings["schedule"])
    ? candidate.schedule as BackupSettings["schedule"]
    : DEFAULT_SETTINGS.schedule;
  const keepMinCount = Number(candidate.keepMinCount);
  return {
    schedule,
    keepMinCount: Number.isInteger(keepMinCount) && keepMinCount >= 1 && keepMinCount <= 50
      ? keepMinCount
      : DEFAULT_SETTINGS.keepMinCount,
    ...(typeof candidate.lastBackupAt === "string" ? { lastBackupAt: candidate.lastBackupAt } : {}),
    ...(typeof candidate.nextScheduledAt === "string" ? { nextScheduledAt: candidate.nextScheduledAt } : {}),
  };
}

export async function saveBackupData(settings: BackupSettings, history: BackupHistoryEntry[]) {
  await mkdir(path.dirname(settingsPath()), { recursive: true });
  await writeFile(
    settingsPath(),
    JSON.stringify({ settings, history }, null, 2),
    "utf8"
  );
}

// Helper: Recursive list files
async function getFilesRecursively(dir: string): Promise<string[]> {
  const files: string[] = [];
  async function walk(currentDir: string) {
    try {
      const entries = await readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const res = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          await walk(res);
        } else {
          files.push(res);
        }
      }
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
      throw error;
    }
  }
  await walk(dir);
  return files;
}

// Helper: Copy directory recursively
async function copyDirectory(src: string, dest: string) {
  await mkdir(dest, { recursive: true });
  try {
    const entries = await readdir(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        await copyDirectory(srcPath, destPath);
      } else {
        await copyFile(srcPath, destPath);
      }
    }
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
}

async function removeSqliteSidecars(databasePath: string) {
  await Promise.all([
    rm(`${databasePath}-wal`, { force: true }),
    rm(`${databasePath}-shm`, { force: true }),
    rm(`${databasePath}-journal`, { force: true }),
  ]);
}

// Helper: Get Schema Migrations
async function getSchemaMigrations(): Promise<string[]> {
  const migrationsPath = process.env.PRINTX_SCHEMA_MIGRATIONS_PATH
    ? path.resolve(process.env.PRINTX_SCHEMA_MIGRATIONS_PATH)
    : path.resolve(process.cwd(), "prisma", "migrations");
  try {
    const items = await readdir(migrationsPath, { withFileTypes: true });
    return items
      .filter((item) => item.isDirectory())
      .map((item) => item.name)
      .sort();
  } catch {
    return [];
  }
}

// Calculate next scheduled backup time
export function calculateNextScheduledDate(
  schedule: "disabled" | "daily" | "weekly" | "monthly",
  fromDate = new Date()
): Date | undefined {
  if (schedule === "disabled") return undefined;
  const date = new Date(fromDate);
  if (schedule === "daily") {
    date.setDate(date.getDate() + 1);
  } else if (schedule === "weekly") {
    date.setDate(date.getDate() + 7);
  } else if (schedule === "monthly") {
    date.setMonth(date.getMonth() + 1);
  }
  return date;
}

// CREATE BACKUP
export async function createBackup(type: "manual" | "scheduled"): Promise<BackupHistoryEntry> {
  const { settings, history } = await getBackupData();
  const storageSettings = await getOrderStorageSettings();
  const backupId = createHash("md5").update(Date.now().toString() + Math.random().toString()).digest("hex").slice(0, 16);
  const timestampStr = new Date().toISOString().replace(/[:.]/g, "-");
   const filename = `backup_${timestampStr}_${backupId}.zip`;
  const backupDir = backupRootPath();
  const backupFilePath = path.join(backupDir, filename);

  await mkdir(backupDir, { recursive: true });

  const tempDbPath = path.join(path.dirname(activeDatabasePath()), `temp_backup_${backupId}.db`);

  try {
    // 1. SQLite Consistency snapshot (VACUUM INTO)
    try {
      await rm(tempDbPath, { force: true });
    } catch {}
    await prisma.$executeRawUnsafe(`VACUUM INTO '${tempDbPath.replace(/'/g, "''")}'`);

    const databaseChecksum = await calculateFileChecksum(tempDbPath);

    // 2. Scan Order & Sheet files
    const ordersBase = path.resolve(storageSettings.baseFolder);
    const sheetsBase = path.resolve(storageSettings.printSheetFolder);

    const orderFilePaths = await getFilesRecursively(ordersBase);
    const sheetFilePaths = await getFilesRecursively(sheetsBase);

    const manifestFilesList: BackupManifest["files"] = [];
    const zip = new AdmZip();

    // Add DB
    zip.addLocalFile(tempDbPath, "", "sublimation.db");

    // Add Order Files
    for (const filePath of orderFilePaths) {
      const relPath = path.relative(ordersBase, filePath).replaceAll(path.sep, "/");
      const statInfo = await stat(filePath);
      const checksum = await calculateFileChecksum(filePath);
      manifestFilesList.push({
        type: "orders",
        relativePath: relPath,
        size: statInfo.size,
        checksum,
      });
      // Place in files/orders/
      const zipPath = path.dirname(path.join("files", "orders", relPath)).replaceAll(path.sep, "/");
      zip.addLocalFile(filePath, zipPath === "files/orders" ? "files/orders" : zipPath, path.basename(filePath));
    }

    // Add Sheet Files
    for (const filePath of sheetFilePaths) {
      const relPath = path.relative(sheetsBase, filePath).replaceAll(path.sep, "/");
      const statInfo = await stat(filePath);
      const checksum = await calculateFileChecksum(filePath);
      manifestFilesList.push({
        type: "sheets",
        relativePath: relPath,
        size: statInfo.size,
        checksum,
      });
      // Place in files/sheets/
      const zipPath = path.dirname(path.join("files", "sheets", relPath)).replaceAll(path.sep, "/");
      zip.addLocalFile(filePath, zipPath === "files/sheets" ? "files/sheets" : zipPath, path.basename(filePath));
    }

    // 3. Schema migrations snapshot
    const schemaMigrations = await getSchemaMigrations();

    // 4. Manifest generation
    const manifest: BackupManifest = {
      version: "1.0.0",
      createdAt: new Date().toISOString(),
      databaseChecksum,
      files: manifestFilesList,
      schemaMigrations,
    };

    zip.addFile("backup-manifest.json", Buffer.from(JSON.stringify(manifest, null, 2), "utf8"));

    // Materialise the complete archive buffer before writing. This avoids a
    // Windows file-handle race where a just-created archive could be read with
    // an empty manifest by the immediate verification step.
    const temporaryArchivePath = `${backupFilePath}.tmp`;
    await writeFile(temporaryArchivePath, zip.toBuffer());
    await rename(temporaryArchivePath, backupFilePath);

    const zipStat = await stat(backupFilePath);

    const entry: BackupHistoryEntry = {
      id: backupId,
      filename,
      filePath: backupFilePath,
      timestamp: new Date().toISOString(),
      sizeBytes: zipStat.size,
      fileCount: manifestFilesList.length,
      type,
      status: "success",
      isPinned: false,
    };

    // Update settings schedule timing
    settings.lastBackupAt = entry.timestamp;
    if (settings.schedule !== "disabled") {
      settings.nextScheduledAt = calculateNextScheduledDate(settings.schedule, new Date(entry.timestamp))?.toISOString();
    }

    const newHistory = [entry, ...history];
    await saveBackupData(settings, newHistory);

    // Run retention cleanup
    await runBackupRetentionCleanup();

    return entry;
  } catch (error) {
    const entry: BackupHistoryEntry = {
      id: backupId,
      filename,
      filePath: backupFilePath,
      timestamp: new Date().toISOString(),
      sizeBytes: 0,
      fileCount: 0,
      type,
      status: "failed",
      errorMessage: error instanceof Error ? error.message : String(error),
      isPinned: false,
    };
    const newHistory = [entry, ...history];
    await saveBackupData(settings, newHistory);
    throw error;
  } finally {
    try {
      await rm(tempDbPath, { force: true });
    } catch {}
  }
}

// VERIFY BACKUP ARCHIVE
export async function verifyBackupArchive(archivePath: string): Promise<{ valid: boolean; error?: string; manifest?: BackupManifest }> {
  const fallbackDir = await mkdtemp(path.join(os.tmpdir(), "printx-backup-verify-"));
  try {
    let zip: AdmZipInstance | undefined;
    try { zip = await openArchiveWhenReady(archivePath); } catch { await extractArchiveWithSystemTar(archivePath, fallbackDir); }
    if (!zip) {
      const manifest = JSON.parse(await readFile(path.join(fallbackDir, "backup-manifest.json"), "utf8")) as BackupManifest;
      if (manifest.version !== SUPPORTED_BACKUP_VERSION) return { valid: false, error: `Unsupported backup version: ${manifest.version}.` };
      const dbData = await readFile(path.join(fallbackDir, "sublimation.db"));
      if (calculateChecksum(dbData) !== manifest.databaseChecksum) return { valid: false, error: "Database checksum verification failed." };
      for (const file of manifest.files) {
        const fileData = await readFile(path.join(fallbackDir, "files", file.type, file.relativePath));
        if (fileData.length !== file.size || calculateChecksum(fileData) !== file.checksum) return { valid: false, error: `Checksum mismatch for ${file.relativePath}.` };
      }
      return { valid: true, manifest };
    }
    const manifestEntry = zip.getEntry("backup-manifest.json");
    if (!manifestEntry) {
      return { valid: false, error: "Missing backup-manifest.json in archive." };
    }

    const manifestContent = (await readZipEntry(zip, manifestEntry))?.toString("utf8") ?? "";
    const manifest = JSON.parse(manifestContent) as BackupManifest;
    if (manifest.version !== SUPPORTED_BACKUP_VERSION) return { valid: false, error: `Unsupported backup version: ${manifest.version}.` };

    // Verify DB entry exists in ZIP
    const dbEntry = zip.getEntry("sublimation.db");
    if (!dbEntry) {
      return { valid: false, error: "Missing sublimation.db in archive." };
    }

    const dbData = await readZipEntry(zip, dbEntry);
    if (!dbData) return { valid: false, error: "Missing sublimation.db in archive." };
    const dbChecksum = calculateChecksum(dbData);
    if (dbChecksum !== manifest.databaseChecksum) {
      return { valid: false, error: "Database checksum verification failed." };
    }

    // Verify files
    for (const file of manifest.files) {
      const prefix = file.type === "orders" ? "files/orders/" : "files/sheets/";
      const entryName = `${prefix}${file.relativePath}`;
      const entry = zip.getEntry(entryName);
      if (!entry) {
        return { valid: false, error: `Missing file in archive: ${entryName}` };
      }

      const fileData = await readZipEntry(zip, entry);
      if (!fileData) return { valid: false, error: `Missing file in archive: ${entryName}` };
      if (fileData.length !== file.size) {
        return { valid: false, error: `File size mismatch for ${entryName}. Expected: ${file.size}, Got: ${fileData.length}` };
      }

      const checksum = calculateChecksum(fileData);
      if (checksum !== file.checksum) {
        return { valid: false, error: `Checksum mismatch for ${entryName}.` };
      }
    }

    return { valid: true, manifest };
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : "Archive verification failed." };
  } finally {
    await rm(fallbackDir, { recursive: true, force: true });
  }
}

function normaliseStoredPath(value: string): string {
  return value.trim().replaceAll("\\", "/").replace(/^\/+/, "").toLowerCase();
}

function remapStoredPath(value: string, type: "orders" | "sheets", files: BackupManifest["files"], targetRoot: string): string {
  const normalized = normaliseStoredPath(value);
  const candidates = files
    .filter((file) => file.type === type)
    .map((file) => ({ file, normalized: normaliseStoredPath(file.relativePath) }))
    .sort((a, b) => b.normalized.length - a.normalized.length);
  const match = candidates.find(({ normalized: candidate }) => normalized === candidate || normalized.endsWith(`/${candidate}`));
  // A path not present in the archive must never point back to the source machine.
  // Keep its filename in the desktop storage root so historical rows remain usable.
  const relative = match?.file.relativePath ?? path.basename(value);
  return path.resolve(targetRoot, relative);
}

type SqlExecutor = Pick<PrismaClient, "$queryRawUnsafe" | "$executeRawUnsafe">;

async function remapStagedPaths(stagingPrisma: SqlExecutor, manifest: BackupManifest, targetOrdersFolder: string, targetSheetsFolder: string) {
  const files = manifest.files;
  const orderFiles = await stagingPrisma.$queryRawUnsafe<Array<{ id: string; storagePath: string }>>('SELECT "id", "storagePath" FROM "OrderFile"');
  for (const row of orderFiles) {
    await stagingPrisma.$executeRawUnsafe('UPDATE "OrderFile" SET "storagePath" = ? WHERE "id" = ?', remapStoredPath(row.storagePath, "orders", files, targetOrdersFolder), row.id);
  }
  const projects = await stagingPrisma.$queryRawUnsafe<Array<{ id: string; originalPath: string }>>('SELECT "id", "originalPath" FROM "ArtworkProject"');
  for (const row of projects) {
    await stagingPrisma.$executeRawUnsafe('UPDATE "ArtworkProject" SET "originalPath" = ? WHERE "id" = ?', remapStoredPath(row.originalPath, "orders", files, targetOrdersFolder), row.id);
  }
  const versions = await stagingPrisma.$queryRawUnsafe<Array<{ id: string; editedPath: string; printReadyPath: string }>>('SELECT "id", "editedPath", "printReadyPath" FROM "ArtworkVersion"');
  for (const row of versions) {
    await stagingPrisma.$executeRawUnsafe('UPDATE "ArtworkVersion" SET "editedPath" = ?, "printReadyPath" = ? WHERE "id" = ?', remapStoredPath(row.editedPath, "orders", files, targetOrdersFolder), remapStoredPath(row.printReadyPath, "orders", files, targetOrdersFolder), row.id);
  }
  const sheets = await stagingPrisma.$queryRawUnsafe<Array<{ id: string; storagePath: string }>>('SELECT "id", "storagePath" FROM "PrintSheet"');
  for (const row of sheets) {
    await stagingPrisma.$executeRawUnsafe('UPDATE "PrintSheet" SET "storagePath" = ? WHERE "id" = ?', remapStoredPath(row.storagePath, "sheets", files, targetSheetsFolder), row.id);
  }
}

async function preserveDesktopAdminIfMissing(stagingPrisma: SqlExecutor, currentSettings: Array<{ key: string; value: string }>) {
  const staged = await stagingPrisma.$queryRawUnsafe<Array<{ key: string; value: string }>>('SELECT "key", "value" FROM "AppSetting" WHERE "key" IN (?, ?)', ...ADMIN_CREDENTIAL_SETTING_KEYS);
  const stagedValues = new Map(staged.map((row) => [row.key, row.value.trim()]));
  const hasStaged = ADMIN_CREDENTIAL_SETTING_KEYS.every((key) => Boolean(stagedValues.get(key)));
  if (hasStaged) return;
  const currentValues = new Map(currentSettings.map((row) => [row.key, row.value.trim()]));
  const hasCurrent = ADMIN_CREDENTIAL_SETTING_KEYS.every((key) => Boolean(currentValues.get(key)));
  if (!hasCurrent) return;
  for (const key of ADMIN_CREDENTIAL_SETTING_KEYS) {
    await stagingPrisma.$executeRawUnsafe('INSERT INTO "AppSetting" ("id", "key", "value", "updatedAt", "createdAt") VALUES (?, ?, ?, datetime("now"), datetime("now")) ON CONFLICT("key") DO UPDATE SET "value" = excluded."value", "updatedAt" = datetime("now")', randomUUID(), key, currentValues.get(key));
  }
}

// RESTORE BACKUP
export async function restoreBackup(
  archivePath: string,
  options?: { remapOrdersFolder?: string; remapSheetsFolder?: string }
): Promise<{ success: boolean; error?: string }> {
  if (restoreInProgress) return { success: false, error: "Another restore is already in progress." };
  restoreInProgress = true;
  const databasePath = activeDatabasePath();
  const stagingDir = path.join(path.dirname(databasePath), "staging-restore");
  const safetyDir = path.join(path.dirname(databasePath), "safety-backup");

  try {
    const archive = path.resolve(archivePath);
    const archiveInfo = await stat(archive);
    if (!archiveInfo.isFile() || path.extname(archive).toLowerCase() !== ".zip") {
      throw new Error("Backup archive must be an existing .zip file.");
    }
    // 1. Extract to staging
    await rm(stagingDir, { recursive: true, force: true });
    await mkdir(stagingDir, { recursive: true });

    try {
      const zip = await openArchiveWhenReady(archive);
      zip.extractAllTo(stagingDir, true);
    } catch {
      await extractArchiveWithSystemTar(archive, stagingDir);
    }

    // 2. Verify manifest / checksums / sqlite load in staging
    const manifestFile = path.join(stagingDir, "backup-manifest.json");
    const manifestContent = await readFile(manifestFile, "utf8");
    const manifest = JSON.parse(manifestContent) as BackupManifest;
    if (manifest.version !== SUPPORTED_BACKUP_VERSION) throw new Error(`Unsupported backup version: ${manifest.version}.`);
    const knownMigrations = await getSchemaMigrations();
    const unknownMigration = manifest.schemaMigrations.find((migration) => !knownMigrations.includes(migration));
    if (unknownMigration) throw new Error(`Backup requires unsupported database migration: ${unknownMigration}.`);

    const stagedDbPath = path.join(stagingDir, "sublimation.db");
    const dbChecksum = await calculateFileChecksum(stagedDbPath);
    if (dbChecksum !== manifest.databaseChecksum) {
      throw new Error("Staged database checksum mismatch.");
    }

    // Verify files
    for (const file of manifest.files) {
      const subpath = file.type === "orders" ? "orders" : "sheets";
      const filePath = path.join(stagingDir, "files", subpath, file.relativePath);
      const checksum = await calculateFileChecksum(filePath);
      if (checksum !== file.checksum) {
        throw new Error(`Staged file checksum mismatch for ${file.relativePath}`);
      }
    }

    // Resolve desktop destinations before rewriting staged database paths.
    const activeStorage = await getOrderStorageSettings();
    const targetOrdersFolder = options?.remapOrdersFolder
      ? path.resolve(options.remapOrdersFolder)
      : path.resolve(activeStorage.baseFolder);
    const targetSheetsFolder = options?.remapSheetsFolder
      ? path.resolve(options.remapSheetsFolder)
      : path.resolve(activeStorage.printSheetFolder);

    // SQLite load test
    const currentAdminSettings = await prisma.appSetting.findMany({ where: { key: { in: [...ADMIN_CREDENTIAL_SETTING_KEYS] } }, select: { key: true, value: true } });
    const stagingPrisma = new PrismaClient({
      datasources: {
        db: {
          url: `file:${stagedDbPath}`,
        },
      },
    });

    try {
      await stagingPrisma.$queryRawUnsafe("SELECT 1;");
      await stagingPrisma.$transaction(async (tx) => {
        await preserveDesktopAdminIfMissing(tx, currentAdminSettings);
        await remapStagedPaths(tx, manifest, targetOrdersFolder, targetSheetsFolder);
      });
    } catch (err) {
      throw new Error(`Failed to load SQLite staging database: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      await stagingPrisma.$disconnect();
    }

    // 3. Prepare target folders and handle remapping logic
    // Create a normal ZIP emergency backup before replacing anything.
    await createBackup("manual");

    // Create safety backup
    await rm(safetyDir, { recursive: true, force: true });
    await mkdir(safetyDir, { recursive: true });

    const activeDbPath = databasePath;
    const storageSettingsPath = activeStorageSettingsPath();

    // Create a SQLite-consistent rollback snapshot, including committed WAL data.
    const safetyDatabasePath = path.join(safetyDir, "sublimation.db");
    await prisma.$executeRawUnsafe(`VACUUM INTO '${safetyDatabasePath.replace(/'/g, "''")}'`);
    try {
      await copyFile(storageSettingsPath, path.join(safetyDir, "order-storage-settings.json"));
    } catch {}

    // Copy original files
    await copyDirectory(targetOrdersFolder, path.join(safetyDir, "orders"));
    await copyDirectory(targetSheetsFolder, path.join(safetyDir, "sheets"));

    // 4. Perform replace database / files
    // Disconnect active client
    await prisma.$disconnect();

    try {
      // Clean target folders to avoid duplicates
      await rm(targetOrdersFolder, { recursive: true, force: true });
      await rm(targetSheetsFolder, { recursive: true, force: true });
      await mkdir(targetOrdersFolder, { recursive: true });
      await mkdir(targetSheetsFolder, { recursive: true });

      // Copy new files from staging
      const stagedOrdersDir = path.join(stagingDir, "files", "orders");
      const stagedSheetsDir = path.join(stagingDir, "files", "sheets");

      await copyDirectory(stagedOrdersDir, targetOrdersFolder);
      await copyDirectory(stagedSheetsDir, targetSheetsFolder);

      // Copy database
      await removeSqliteSidecars(activeDbPath);
      await copyFile(stagedDbPath, activeDbPath);

      // Save remapped settings
      await saveOrderStorageSettings({
        baseFolder: targetOrdersFolder,
        printSheetFolder: targetSheetsFolder,
        retentionDays: activeStorage.retentionDays,
      });
    } catch (err) {
      // ROLLBACK
      console.warn("Restore failed during files replacement, rolling back...", err);

      await rm(targetOrdersFolder, { recursive: true, force: true });
      await rm(targetSheetsFolder, { recursive: true, force: true });

      await copyDirectory(path.join(safetyDir, "orders"), targetOrdersFolder);
      await copyDirectory(path.join(safetyDir, "sheets"), targetSheetsFolder);

      await removeSqliteSidecars(activeDbPath);
      await copyFile(path.join(safetyDir, "sublimation.db"), activeDbPath);
      try {
        await copyFile(path.join(safetyDir, "order-storage-settings.json"), storageSettingsPath);
      } catch {}

      throw err;
    }

    return { success: true };
  } catch (error) {
    console.error("RESTORE EXCEPTION STACK:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Staged restore failed.",
    };
  } finally {
    // Cleanup staging and safety directories
    await rm(stagingDir, { recursive: true, force: true });
    await rm(safetyDir, { recursive: true, force: true });
    restoreInProgress = false;
  }
}

// AUTOMATIC RETENTION CLEANUP
export async function runBackupRetentionCleanup() {
  const { settings, history } = await getBackupData();
  const successfulBackups = history.filter((b) => b.status === "success");

  if (successfulBackups.length <= settings.keepMinCount) {
    return;
  }

  // Sort successful backups: index 0 is most recent
  successfulBackups.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const keptIds = new Set<string>();
  // Keep the most recent keepMinCount ones
  for (let i = 0; i < settings.keepMinCount; i++) {
    const backup = successfulBackups[i];
    if (backup) {
      keptIds.add(backup.id);
    }
  }

  // Pinned ones are also kept
  for (const backup of successfulBackups) {
    if (backup.isPinned) {
      keptIds.add(backup.id);
    }
  }

  const updatedHistory: BackupHistoryEntry[] = [];

  for (const backup of history) {
    if (backup.status === "failed") {
      // Failed backups are kept in history but don't take disk space usually.
      // We can keep them or clean them. Let's keep them in history log.
      updatedHistory.push(backup);
      continue;
    }

    if (keptIds.has(backup.id)) {
      updatedHistory.push(backup);
    } else {
      // Delete backup file
      try {
        await rm(backup.filePath, { force: true });
      } catch (err) {
        console.error(`Failed to delete backup file: ${backup.filePath}`, err);
      }
    }
  }

  await saveBackupData(settings, updatedHistory);
}

// SCHEDULE CHECK TRIGGER
export async function checkAndRunScheduledBackup() {
  const { settings } = await getBackupData();
  if (settings.schedule === "disabled") return;

  const now = new Date();
  const next = settings.nextScheduledAt ? new Date(settings.nextScheduledAt) : undefined;
  if (!next || Number.isNaN(next.getTime()) || now >= next) {
    try {
      await createBackup("scheduled");
    } catch (err) {
      console.error("Scheduled background backup failed", err);
    }
  }
}
