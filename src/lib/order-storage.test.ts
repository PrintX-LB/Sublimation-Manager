import { describe, expect, it } from "vitest";
import path from "node:path";
import {
  finalDateFor,
  sanitizeOrderFolderName,
  getOrderStorageSettings,
  saveOrderStorageSettings,
  getOrderFilesBaseFolder,
  getPrintSheetBuilderFolder,
} from "./order-storage";

describe("order storage cleanup helpers", () => {
  it("uses the recorded final-status timestamp first", () => {
    const finalStatusAt = new Date("2026-01-01T00:00:00.000Z");
    expect(finalDateFor({ status: "Delivered", finalStatusAt, completedAt: null, deliveredAt: new Date("2025-01-01T00:00:00.000Z") })).toBe(finalStatusAt);
  });

  it("falls back to the status-specific timestamp", () => {
    const deliveredAt = new Date("2025-01-01T00:00:00.000Z");
    expect(finalDateFor({ status: "Delivered", finalStatusAt: null, completedAt: null, deliveredAt })).toBe(deliveredAt);
  });

  it("does not use creation or update time for an undated final order", () => {
    expect(finalDateFor({ status: "Cancelled", finalStatusAt: null, completedAt: null, cancelledAt: null })).toBeNull();
  });

  it("sanitizes customer names without allowing path separators", () => {
    expect(sanitizeOrderFolderName("PX00001", "A/B: Test")).toBe("PX00001 - A-B- Test");
  });
});

describe("Storage Configurations and Paths Persistence", () => {
  it("saves and loads order files folder and print sheets folder settings correctly", async () => {
    const testBase = path.resolve(process.cwd(), "test_uploads_base");
    const testPrintSheets = path.resolve(process.cwd(), "test_print_sheets_base");
    const testRetention = 20;

    await saveOrderStorageSettings({
      baseFolder: testBase,
      printSheetFolder: testPrintSheets,
      retentionDays: testRetention,
    });

    const loaded = await getOrderStorageSettings();
    expect(loaded.baseFolder).toBe(testBase);
    expect(loaded.printSheetFolder).toBe(testPrintSheets);
    expect(loaded.retentionDays).toBe(testRetention);

    const ordersBase = await getOrderFilesBaseFolder();
    const sheetsBase = await getPrintSheetBuilderFolder();
    expect(ordersBase).toBe(testBase);
    expect(sheetsBase).toBe(testPrintSheets);
  });

  it("fails to save invalid relative storage settings path values", async () => {
    await expect(
      saveOrderStorageSettings({
        baseFolder: "relative/path/one",
        printSheetFolder: path.resolve(process.cwd(), "valid_path"),
        retentionDays: 15,
      })
    ).rejects.toThrow();

    await expect(
      saveOrderStorageSettings({
        baseFolder: path.resolve(process.cwd(), "valid_path"),
        printSheetFolder: "relative/path/two",
        retentionDays: 15,
      })
    ).rejects.toThrow();
  });
});
