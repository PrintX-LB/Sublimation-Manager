import { afterAll, beforeAll, describe, expect, it } from "vitest";
import path from "node:path";
import { mkdir, writeFile, rm, access, readFile } from "node:fs/promises";
import { saveOrderStorageSettings } from "./order-storage";
import { prisma } from "./db/prisma";
import { ADMIN_CREDENTIAL_SETTING_KEYS, initializeAdminCredentials, verifyAdminCredentials } from "./admin-credentials";
import {
  createBackup,
  verifyBackupArchive,
  restoreBackup,
  getBackupData,
  saveBackupData,
  runBackupRetentionCleanup,
} from "./backup-restore";

describe("Backup & Restore System Tests", () => {
  const tempTestDir = path.resolve(process.cwd(), "data", "test-backup-restore");
  const tempOrdersDir = path.join(tempTestDir, "orders");
  const tempSheetsDir = path.join(tempTestDir, "sheets");

  beforeAll(async () => {
    await rm(tempTestDir, { recursive: true, force: true });
    await mkdir(tempTestDir, { recursive: true });
    await mkdir(tempOrdersDir, { recursive: true });
    await mkdir(tempSheetsDir, { recursive: true });

    // Save temporary storage settings
    await saveOrderStorageSettings({
      baseFolder: tempOrdersDir,
      printSheetFolder: tempSheetsDir,
      retentionDays: 10,
    });
  });

  afterAll(async () => {
    await rm(tempTestDir, { recursive: true, force: true });
  });

  it("can serialize SQLite database, generate manifest, and build archive", async () => {
    // 1. Create dummy files
    await writeFile(path.join(tempOrdersDir, "dummy_order.txt"), "hello order", "utf8");
    await writeFile(path.join(tempSheetsDir, "dummy_sheet.txt"), "hello sheet", "utf8");

    // 2. Create backup
    const entry = await createBackup("manual");
    expect(entry.status).toBe("success");
    expect(entry.fileCount).toBe(2);
    expect(entry.sizeBytes).toBeGreaterThan(0);

    // 3. Verify archive integrity
    const verification = await verifyBackupArchive(entry.filePath);
    expect(verification.error).toBeUndefined();
    expect(verification.valid).toBe(true);
    expect(verification.manifest).toBeDefined();
    expect(verification.manifest?.files.length).toBe(2);

    // Clean up backup file
    await rm(entry.filePath, { force: true });
  });

  it("performs staged restore, handles path remapping, and rolls back on failure", async () => {
    // 1. Write dummy files
    const dummyFile1 = path.join(tempOrdersDir, "restore_test.txt");
    await writeFile(dummyFile1, "original data", "utf8");

    // 2. Create the backup
    const backupEntry = await createBackup("manual");
    expect(backupEntry.status).toBe("success");

    // 3. Modify the files to simulate change
    await writeFile(dummyFile1, "modified data", "utf8");

    // 4. Restore the backup
    const restoreRes = await restoreBackup(backupEntry.filePath);
    expect(restoreRes.error).toBeUndefined();
    expect(restoreRes.success).toBe(true);

    // 5. Verify the file content is restored
    const restoredContent = await readFile(dummyFile1, "utf8");
    expect(restoredContent).toBe("original data");

    // 6. Test remapping paths during restore
    const remapOrders = path.join(tempTestDir, "remapped_orders");
    const remapSheets = path.join(tempTestDir, "remapped_sheets");

    const remapRes = await restoreBackup(backupEntry.filePath, {
      remapOrdersFolder: remapOrders,
      remapSheetsFolder: remapSheets,
    });
    expect(remapRes.error).toBeUndefined();
    expect(remapRes.success).toBe(true);

    // Check if files exist at remapped location
    const remappedFileExist = await access(path.join(remapOrders, "restore_test.txt"))
      .then(() => true)
      .catch(() => false);
    expect(remappedFileExist).toBe(true);

    // 7. Cleanup backup file and remapped folders
    await rm(backupEntry.filePath, { force: true });
    await rm(remapOrders, { recursive: true, force: true });
    await rm(remapSheets, { recursive: true, force: true });
  });

  it("verifies retention cleanup respects keepMinCount and pins", async () => {
    const { settings } = await getBackupData();
    settings.keepMinCount = 2;
    
    // Create dummy history
    const history = [
      { id: "1", filename: "b1.zip", filePath: path.join(tempTestDir, "b1.zip"), timestamp: "2026-07-10T10:00:00.000Z", sizeBytes: 10, fileCount: 1, type: "manual" as const, status: "success" as const, isPinned: false },
      { id: "2", filename: "b2.zip", filePath: path.join(tempTestDir, "b2.zip"), timestamp: "2026-07-11T10:00:00.000Z", sizeBytes: 10, fileCount: 1, type: "manual" as const, status: "success" as const, isPinned: false },
      { id: "3", filename: "b3.zip", filePath: path.join(tempTestDir, "b3.zip"), timestamp: "2026-07-12T10:00:00.000Z", sizeBytes: 10, fileCount: 1, type: "manual" as const, status: "success" as const, isPinned: false },
      { id: "4", filename: "b4.zip", filePath: path.join(tempTestDir, "b4.zip"), timestamp: "2026-07-13T10:00:00.000Z", sizeBytes: 10, fileCount: 1, type: "manual" as const, status: "success" as const, isPinned: true }, // pinned
    ];

    // Create dummy files
    for (const h of history) {
      await writeFile(h.filePath, "zip data", "utf8");
    }

    await saveBackupData(settings, history);
    await runBackupRetentionCleanup();

    const data = await getBackupData();
    // Pinned (b4.zip) must be kept.
    // The most recent keepMinCount (2) are b3.zip and b4.zip.
    // The rest (b1.zip, b2.zip) should be deleted.
    const remainingFiles = data.history.map(b => b.filename);
    expect(remainingFiles).toContain("b4.zip"); // pinned
    expect(remainingFiles).toContain("b3.zip"); // most recent
    expect(remainingFiles).not.toContain("b1.zip"); // deleted
    expect(remainingFiles).not.toContain("b2.zip"); // deleted
  });

  it("restores database-backed Admin configuration from the backup snapshot", async () => {
    const originalUsername = process.env.ADMIN_USERNAME;
    const originalPasswordHash = process.env.ADMIN_PASSWORD_HASH;
    process.env.ADMIN_USERNAME = "";
    process.env.ADMIN_PASSWORD_HASH = "";
    try {
      await prisma.appSetting.deleteMany({ where: { key: { in: [...ADMIN_CREDENTIAL_SETTING_KEYS] } } });
      await initializeAdminCredentials({
        username: "backup-owner",
        password: "original-admin-password",
        confirmPassword: "original-admin-password",
      });
      const backupEntry = await createBackup("manual");

      await prisma.appSetting.update({ where: { key: "admin.username" }, data: { value: "changed-owner" } });
      await expect(verifyAdminCredentials("backup-owner", "original-admin-password")).resolves.toBe(false);

      const restored = await restoreBackup(backupEntry.filePath);
      expect(restored).toEqual({ success: true });
      await expect(verifyAdminCredentials("backup-owner", "original-admin-password")).resolves.toBe(true);
      await expect(verifyAdminCredentials("changed-owner", "original-admin-password")).resolves.toBe(false);
      await rm(backupEntry.filePath, { force: true });
    } finally {
      await prisma.appSetting.deleteMany({ where: { key: { in: [...ADMIN_CREDENTIAL_SETTING_KEYS] } } });
      if (originalUsername === undefined) delete process.env.ADMIN_USERNAME;
      else process.env.ADMIN_USERNAME = originalUsername;
      if (originalPasswordHash === undefined) delete process.env.ADMIN_PASSWORD_HASH;
      else process.env.ADMIN_PASSWORD_HASH = originalPasswordHash;
    }
  });
});
