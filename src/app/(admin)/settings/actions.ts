"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { clearAdminSession, getAdminSession, setAdminSession, verifyAdminCredentials } from "@/lib/admin-session";
import { isRedirectError } from "next/dist/client/components/redirect-error";
export async function adminLoginAction(formData: FormData) { const ok = await verifyAdminCredentials(String(formData.get("username") ?? ""), String(formData.get("password") ?? "")); if (!ok) redirect("/settings?admin=invalid"); await setAdminSession(); redirect("/settings?admin=unlocked"); }
export async function adminLogoutAction() { await clearAdminSession(); redirect("/settings?admin=locked"); }
export type ResetDevelopmentResult = { ok: boolean; message: string; counts?: Record<string, number> };

export async function resetDevelopmentDataAction(_previous: ResetDevelopmentResult | null, formData: FormData): Promise<ResetDevelopmentResult> {
  if (process.env.NODE_ENV !== "development") return { ok: false, message: "Reset is available only in development mode." };
  try {
    const { requireAdmin } = await import("@/lib/admin-session");
    await requireAdmin();
  } catch {
    return { ok: false, message: "Admin Mode is required." };
  }
  const confirmation = String(formData.get("resetDevelopmentConfirmation") ?? "").trim();
  if (confirmation !== "RESET PRINTX DATA") return { ok: false, message: "Type RESET PRINTX DATA to continue." };

  const { prisma } = await import("@/lib/db/prisma");
  const [files, projects, versions, sheets] = await Promise.all([
    prisma.orderFile.findMany({ select: { storagePath: true } }),
    prisma.artworkProject.findMany({ select: { originalPath: true } }),
    prisma.artworkVersion.findMany({ select: { editedPath: true, printReadyPath: true } }),
    prisma.printSheet.findMany({ select: { storagePath: true } }),
  ]);
  try {
    const counts = await prisma.$transaction(async (tx) => {
      // This protected development reset intentionally clears all operational
      // inventory history, then leaves the configured inventory structure
      // ready for clean restocking. Normal deletion never uses this path.
      // Break self/cross-record foreign keys before deleting the history.
      const inventoryReset = await clearInventoryForDevelopmentReset(tx);
      const sheetSlots = await tx.printSheetSlot.deleteMany();
      const sheetEvents = await tx.printSheetEvent.deleteMany();
      const incidents = await tx.productionIncident.deleteMany();
      const attempts = await tx.productionAttempt.deleteMany();
      const payments = await tx.payment.deleteMany();
      const orderFiles = await tx.orderFile.deleteMany();
      const versions = await tx.artworkVersion.deleteMany();
      const projects = await tx.artworkProject.deleteMany();
      const sheets = await tx.printSheet.deleteMany();
      const items = await tx.orderItem.deleteMany();
      const orders = await tx.order.deleteMany();
      const customers = await tx.customer.deleteMany();
      // Operational identifiers are reset together with their deleted records.
      // Configuration sequences (if introduced later) are intentionally kept.
      const sequences = await tx.sequence.deleteMany({
        where: { key: { in: ["customer", "order-global", "print-sheet-number"] } },
      });
      return { materialConsumptions: inventoryReset.materialConsumptions, stockMovements: inventoryReset.stockMovements, inventoryTransactions: inventoryReset.inventoryTransactions, inventoryTransactionsDetached: inventoryReset.detached, sheetSlots: sheetSlots.count, sheetEvents: sheetEvents.count, incidents: incidents.count, attempts: attempts.count, payments: payments.count, orderFiles: orderFiles.count, artworkVersions: versions.count, artworkProjects: projects.count, printSheets: sheets.count, orderItems: items.count, orders: orders.count, customers: customers.count, sequences: sequences.count };
    });
    let fileErrors = 0;
    const { rm } = await import("node:fs/promises");
    for (const storedPath of [...files.map((file) => file.storagePath), ...projects.map((project) => project.originalPath), ...versions.flatMap((version) => [version.editedPath, version.printReadyPath]), ...sheets.map((sheet) => sheet.storagePath)]) {
      try { await rm(storedPath, { force: true }); } catch { fileErrors += 1; }
    }
    revalidatePath("/settings");
    revalidatePath("/dashboard");
    revalidatePath("/orders");
    revalidatePath("/customers");
    revalidatePath("/production");
    revalidatePath("/revenue");
    return { ok: fileErrors === 0, message: fileErrors === 0 ? "Development data reset completed." : `Database reset completed, but ${fileErrors} file(s) could not be removed.`, counts: { ...counts, fileErrors } };
  } catch {
    return { ok: false, message: "Reset could not complete. No data was changed." };
  }
}
import { saveOrderStorageSettings, runOrderStorageCleanup } from "@/lib/order-storage";
import { clearInventoryForDevelopmentReset } from "@/lib/inventory/development-reset";
import { requireAdmin } from "@/lib/admin-session";
import { mkdir, writeFile, unlink, rm } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  getBackupData,
  saveBackupData,
  createBackup,
  restoreBackup,
  calculateNextScheduledDate,
} from "@/lib/backup-restore";

export async function saveStorageSettingsAction(formData: FormData) {
  await requireAdmin();
  const baseFolder = String(formData.get("baseFolder") ?? "").trim();
  const printSheetFolder = String(formData.get("printSheetFolder") ?? "").trim();
  const retentionDays = Number(formData.get("retentionDays") ?? 15);

  if (!path.isAbsolute(baseFolder) || !path.isAbsolute(printSheetFolder)) {
    throw new Error("INVALID_ABSOLUTE_PATH");
  }

  await saveOrderStorageSettings({ baseFolder, printSheetFolder, retentionDays });
}

export async function testStorageFolderAction(formData: FormData) {
  await requireAdmin();
  const type = String(formData.get("folderType") ?? "orders");
  const folder = type === "sheets"
    ? String(formData.get("printSheetFolder") ?? "").trim()
    : String(formData.get("baseFolder") ?? "").trim();

  if (!folder || !path.isAbsolute(folder)) {
    redirect(`/settings?testResult=invalid&type=${type}`);
  }

  try {
    // 1. Confirm exists / create
    await mkdir(folder, { recursive: true });

    // 2 & 3. Test read/write with a temp file
    const tempFile = path.join(folder, `.printx_test_${Date.now()}.tmp`);
    await writeFile(tempFile, "write_test", "utf8");
    await unlink(tempFile);

    redirect(`/settings?testResult=success&type=${type}`);
  } catch (err) {
    redirect(`/settings?testResult=failed&type=${type}&error=${encodeURIComponent(err instanceof Error ? err.message : "Access denied")}`);
  }
}

export async function openConfiguredFolderAction(formData: FormData) {
  await requireAdmin();
  const type = String(formData.get("folderType") ?? "orders");
  const folder = type === "sheets"
    ? String(formData.get("printSheetFolder") ?? "").trim()
    : String(formData.get("baseFolder") ?? "").trim();

  if (!folder || !path.isAbsolute(folder)) {
    redirect("/settings?openResult=invalid");
  }

  // Windows Explorer launch via argv (never interpolate a user path into a shell command).
  if (process.platform === "win32") {
    const explorer = spawn("explorer.exe", [folder], { detached: true, windowsHide: true, stdio: "ignore" });
    explorer.on("error", (error) => console.error("Failed to open Explorer path", error));
    explorer.unref();
  }

  redirect(`/settings?openResult=success&type=${type}`);
}

export async function runStorageCleanupAction(formData: FormData) {
  // Keep the server-side authorization check; redirect instead of exposing a
  // raw Server Action exception when the 30-minute admin session has expired.
  if (!(await getAdminSession())) redirect("/settings?admin=required");
  await requireAdmin();
  const result = await runOrderStorageCleanup(String(formData.get("force") ?? "") === "true");
  const params = new URLSearchParams({ storage: "cleaned", checked: String(result.ordersChecked), eligible: String(result.eligibleOrders), folders: String(result.foldersDeleted), files: String(result.filesDeleted), skipped: String(result.skippedOrders), errors: String(result.errors) });
  if (result.skippedReasons.length) params.set("reason", result.skippedReasons.slice(0, 3).join(" | "));
  redirect(`/settings?${params.toString()}`);
}

export async function saveBackupSettingsAction(formData: FormData) {
  await requireAdmin();
  const rawSchedule = String(formData.get("schedule") ?? "disabled");
  const schedules = ["disabled", "daily", "weekly", "monthly"] as const;
  if (!schedules.includes(rawSchedule as (typeof schedules)[number])) {
    redirect("/settings?backupSettings=invalid");
  }
  const schedule = rawSchedule as (typeof schedules)[number];
  const keepMinCount = Number(formData.get("keepMinCount") ?? 5);
  if (!Number.isInteger(keepMinCount) || keepMinCount < 1 || keepMinCount > 50) {
    redirect("/settings?backupSettings=invalid");
  }

  const { settings, history } = await getBackupData();
  settings.schedule = schedule;
  settings.keepMinCount = keepMinCount;
  if (schedule !== "disabled") {
    settings.nextScheduledAt = calculateNextScheduledDate(schedule, new Date())?.toISOString();
  } else {
    settings.nextScheduledAt = undefined;
  }

  await saveBackupData(settings, history);
  redirect("/settings?backupSettings=saved");
}

export async function createManualBackupAction() {
  await requireAdmin();
  try {
    await createBackup("manual");
    redirect("/settings?backup=created");
  } catch (err) {
    if (isRedirectError(err)) throw err;
    redirect(`/settings?backup=failed&error=${encodeURIComponent(err instanceof Error ? err.message : "Backup failed")}`);
  }
}

export async function togglePinBackupAction(id: string) {
  await requireAdmin();
  const { settings, history } = await getBackupData();
  const backup = history.find((b) => b.id === id);
  if (backup) {
    backup.isPinned = !backup.isPinned;
    await saveBackupData(settings, history);
  }
  redirect("/settings?backup=pinned");
}

export async function deleteBackupAction(id: string) {
  await requireAdmin();
  const { settings, history } = await getBackupData();
  const backup = history.find((b) => b.id === id);
  if (backup) {
    await rm(backup.filePath, { force: true });
  }
  const newHistory = history.filter((b) => b.id !== id);
  await saveBackupData(settings, newHistory);
  redirect("/settings?backup=deleted");
}

export async function restoreFromHistoryAction(id: string, remapOrders?: string, remapSheets?: string) {
  await requireAdmin();
  const { history } = await getBackupData();
  const backup = history.find((b) => b.id === id);
  if (!backup) {
    redirect("/settings?restore=notfound");
  }
  const res = await restoreBackup(backup.filePath, {
    remapOrdersFolder: remapOrders || undefined,
    remapSheetsFolder: remapSheets || undefined,
  });
  if (res.success) {
    redirect("/settings?restore=success");
  } else {
    redirect(`/settings?restore=failed&error=${encodeURIComponent(res.error || "Restore failed")}`);
  }
}

export async function restoreFromPathAction(formData: FormData) {
  await requireAdmin();
  const archivePath = String(formData.get("archivePath") ?? "").trim();
  const remapOrders = String(formData.get("remapOrdersFolder") ?? "").trim();
  const remapSheets = String(formData.get("remapSheetsFolder") ?? "").trim();

  if (!archivePath) {
    redirect("/settings?restore=invalidpath");
  }

  const res = await restoreBackup(archivePath, {
    remapOrdersFolder: remapOrders || undefined,
    remapSheetsFolder: remapSheets || undefined,
  });
  if (res.success) {
    redirect("/settings?restore=success");
  } else {
    redirect(`/settings?restore=failed&error=${encodeURIComponent(res.error || "Restore failed")}`);
  }
}
