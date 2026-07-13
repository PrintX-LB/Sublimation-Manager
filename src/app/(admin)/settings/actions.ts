"use server";
import { redirect } from "next/navigation";
import { clearAdminSession, getAdminSession, setAdminSession, verifyAdminCredentials } from "@/lib/admin-session";
export async function adminLoginAction(formData: FormData) { const ok = await verifyAdminCredentials(String(formData.get("username") ?? ""), String(formData.get("password") ?? "")); if (!ok) redirect("/settings?admin=invalid"); await setAdminSession(); redirect("/settings?admin=unlocked"); }
export async function adminLogoutAction() { await clearAdminSession(); redirect("/settings?admin=locked"); }
export async function resetDevelopmentDataAction(formData: FormData) { if (process.env.NODE_ENV !== "development") throw new Error("DEVELOPMENT_ONLY"); const { requireAdmin } = await import("@/lib/admin-session"); await requireAdmin(); if (String(formData.get("resetDevelopmentConfirmation")) !== "RESET") throw new Error("RESET_CONFIRMATION_REQUIRED"); const { prisma } = await import("@/lib/db/prisma"); await prisma.$transaction(async (tx) => { await tx.stockMovement.deleteMany(); await tx.payment.deleteMany(); await tx.orderFile.deleteMany(); await tx.orderItem.deleteMany(); await tx.order.deleteMany(); await tx.artworkVersion.deleteMany(); await tx.artworkProject.deleteMany(); }); redirect("/orders?reset=success"); }
import { saveOrderStorageSettings, runOrderStorageCleanup } from "@/lib/order-storage";
import { requireAdmin } from "@/lib/admin-session";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { exec } from "node:child_process";

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

  // Windows Explorer launch via cmd/exec (Local mode restriction)
  if (process.platform === "win32") {
    exec(`explorer "${folder}"`, (err) => {
      if (err) console.error("Failed to open Explorer path", err);
    });
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
