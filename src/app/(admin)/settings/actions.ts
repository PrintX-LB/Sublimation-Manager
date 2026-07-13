"use server";
import { redirect } from "next/navigation";
import { clearAdminSession, getAdminSession, setAdminSession, verifyAdminCredentials } from "@/lib/admin-session";
export async function adminLoginAction(formData: FormData) { const ok = await verifyAdminCredentials(String(formData.get("username") ?? ""), String(formData.get("password") ?? "")); if (!ok) redirect("/settings?admin=invalid"); await setAdminSession(); redirect("/settings?admin=unlocked"); }
export async function adminLogoutAction() { await clearAdminSession(); redirect("/settings?admin=locked"); }
export async function resetDevelopmentDataAction(formData: FormData) { if (process.env.NODE_ENV !== "development") throw new Error("DEVELOPMENT_ONLY"); const { requireAdmin } = await import("@/lib/admin-session"); await requireAdmin(); if (String(formData.get("confirmation")) !== "RESET") throw new Error("RESET_CONFIRMATION_REQUIRED"); const { prisma } = await import("@/lib/db/prisma"); await prisma.$transaction(async (tx) => { await tx.stockMovement.deleteMany(); await tx.payment.deleteMany(); await tx.orderFile.deleteMany(); await tx.orderItem.deleteMany(); await tx.order.deleteMany(); await tx.artworkVersion.deleteMany(); await tx.artworkProject.deleteMany(); }); redirect("/orders?reset=success"); }
import { saveOrderStorageSettings, runOrderStorageCleanup } from "@/lib/order-storage";
import { requireAdmin } from "@/lib/admin-session";
import { mkdir } from "node:fs/promises";
import path from "node:path";

export async function saveStorageSettingsAction(formData: FormData) { await requireAdmin(); const baseFolder = String(formData.get("baseFolder") ?? "").trim(); const retentionDays = Number(formData.get("retentionDays") ?? 15); await saveOrderStorageSettings({ baseFolder, retentionDays }); }
export async function testStorageFolderAction(formData: FormData) { await requireAdmin(); const folder = path.resolve(String(formData.get("baseFolder") ?? "")); await mkdir(folder, { recursive: true }); }
export async function runStorageCleanupAction(formData: FormData) {
  // Keep the server-side authorization check; redirect instead of exposing a
  // raw Server Action exception when the 30-minute admin session has expired.
  if (!(await getAdminSession())) redirect("/settings?admin=required");
  await requireAdmin();
  await runOrderStorageCleanup(String(formData.get("force") ?? "") === "true");
  redirect("/settings?storage=cleaned");
}
