import { afterAll, beforeEach, describe, expect, it } from "vitest";
// bcryptjs currently ships without declarations in this project.
// @ts-expect-error The runtime package exposes the hash API used below.
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import {
  ADMIN_CREDENTIAL_SETTING_KEYS,
  getAdminCredentialStatus,
  initializeAdminCredentials,
  verifyAdminCredentials,
} from "./admin-credentials";

const originalUsername = process.env.ADMIN_USERNAME;
const originalPasswordHash = process.env.ADMIN_PASSWORD_HASH;

async function clearDatabaseCredentials() {
  await prisma.appSetting.deleteMany({
    where: { key: { in: [...ADMIN_CREDENTIAL_SETTING_KEYS] } },
  });
}

describe("Admin credential initialization", () => {
  beforeEach(async () => {
    process.env.ADMIN_USERNAME = "";
    process.env.ADMIN_PASSWORD_HASH = "";
    await clearDatabaseCredentials();
  });

  afterAll(async () => {
    await clearDatabaseCredentials();
    if (originalUsername === undefined) delete process.env.ADMIN_USERNAME;
    else process.env.ADMIN_USERNAME = originalUsername;
    if (originalPasswordHash === undefined) delete process.env.ADMIN_PASSWORD_HASH;
    else process.env.ADMIN_PASSWORD_HASH = originalPasswordHash;
  });

  it("offers one-time setup on a completely fresh database and stores only a password hash", async () => {
    await expect(getAdminCredentialStatus()).resolves.toEqual({ configured: false, source: null });

    const result = await initializeAdminCredentials({
      username: "owner",
      password: "fresh-admin-password",
      confirmPassword: "fresh-admin-password",
    });
    expect(result).toEqual({ ok: true });
    await expect(getAdminCredentialStatus()).resolves.toEqual({ configured: true, source: "database" });
    await expect(verifyAdminCredentials("owner", "fresh-admin-password")).resolves.toBe(true);
    await expect(verifyAdminCredentials("owner", "wrong-password")).resolves.toBe(false);

    const storedHash = await prisma.appSetting.findUnique({ where: { key: "admin.passwordHash" } });
    expect(storedHash?.value).not.toBe("fresh-admin-password");
    await expect(bcrypt.compare("fresh-admin-password", storedHash?.value ?? "")).resolves.toBe(true);
  });

  it("cannot overwrite an initialized administrator through first-run setup", async () => {
    await initializeAdminCredentials({ username: "owner", password: "first-password", confirmPassword: "first-password" });
    await expect(initializeAdminCredentials({ username: "other", password: "second-password", confirmPassword: "second-password" }))
      .resolves.toEqual({ ok: false, reason: "ALREADY_CONFIGURED" });
    await expect(verifyAdminCredentials("owner", "first-password")).resolves.toBe(true);
    await expect(verifyAdminCredentials("other", "second-password")).resolves.toBe(false);
  });

  it("retains the existing environment-based Admin mechanism for browser deployments", async () => {
    process.env.ADMIN_USERNAME = "browser-owner";
    process.env.ADMIN_PASSWORD_HASH = await bcrypt.hash("browser-admin-password", 4);
    await expect(getAdminCredentialStatus()).resolves.toEqual({ configured: true, source: "environment" });
    await expect(verifyAdminCredentials("browser-owner", "browser-admin-password")).resolves.toBe(true);
    await expect(initializeAdminCredentials({ username: "desktop", password: "desktop-password", confirmPassword: "desktop-password" }))
      .resolves.toEqual({ ok: false, reason: "ALREADY_CONFIGURED" });
  });
});
