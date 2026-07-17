import { prisma } from "@/lib/db/prisma";
// bcryptjs currently ships without declarations in this project.
// @ts-expect-error The runtime package exposes the hash/compare APIs used below.
import bcrypt from "bcryptjs";

const ADMIN_USERNAME_KEY = "admin.username";
const ADMIN_PASSWORD_HASH_KEY = "admin.passwordHash";
const ADMIN_SETTING_KEYS = [ADMIN_USERNAME_KEY, ADMIN_PASSWORD_HASH_KEY] as const;

export type AdminCredentialStatus = {
  configured: boolean;
  source: "environment" | "database" | null;
  configurationError?: "INCOMPLETE_ENVIRONMENT" | "INCOMPLETE_DATABASE";
};

type StoredCredentials = {
  username: string;
  passwordHash: string;
};

function environmentCredentials(): StoredCredentials | null | "incomplete" {
  const username = process.env.ADMIN_USERNAME?.trim() ?? "";
  const passwordHash = process.env.ADMIN_PASSWORD_HASH?.trim() ?? "";
  if (!username && !passwordHash) return null;
  if (!username || !passwordHash) return "incomplete";
  return { username, passwordHash };
}

async function databaseCredentials(): Promise<StoredCredentials | null | "incomplete"> {
  const settings = await prisma.appSetting.findMany({
    where: { key: { in: [...ADMIN_SETTING_KEYS] } },
    select: { key: true, value: true },
  });
  if (!settings.length) return null;
  const values = new Map(settings.map((setting) => [setting.key, setting.value.trim()]));
  const username = values.get(ADMIN_USERNAME_KEY) ?? "";
  const passwordHash = values.get(ADMIN_PASSWORD_HASH_KEY) ?? "";
  if (!username || !passwordHash) return "incomplete";
  return { username, passwordHash };
}

async function configuredCredentials(): Promise<StoredCredentials | null> {
  const fromEnvironment = environmentCredentials();
  if (fromEnvironment === "incomplete") return null;
  if (fromEnvironment) return fromEnvironment;
  const fromDatabase = await databaseCredentials();
  return fromDatabase === "incomplete" ? null : fromDatabase;
}

export async function getAdminCredentialStatus(): Promise<AdminCredentialStatus> {
  const fromEnvironment = environmentCredentials();
  if (fromEnvironment === "incomplete") {
    return { configured: false, source: null, configurationError: "INCOMPLETE_ENVIRONMENT" };
  }
  if (fromEnvironment) return { configured: true, source: "environment" };

  const fromDatabase = await databaseCredentials();
  if (fromDatabase === "incomplete") {
    return { configured: false, source: null, configurationError: "INCOMPLETE_DATABASE" };
  }
  return fromDatabase
    ? { configured: true, source: "database" }
    : { configured: false, source: null };
}

export async function verifyAdminCredentials(username: string, password: string): Promise<boolean> {
  const configured = await configuredCredentials();
  if (!configured || !password) return false;
  const usernameMatches = username.trim() === configured.username;
  if (!usernameMatches) return false;
  return bcrypt.compare(password, configured.passwordHash);
}

export type InitializeAdminResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "ALREADY_CONFIGURED"
        | "CONFIGURATION_ERROR"
        | "INVALID_USERNAME"
        | "WEAK_PASSWORD"
        | "PASSWORD_MISMATCH";
    };

export async function initializeAdminCredentials(input: {
  username: string;
  password: string;
  confirmPassword: string;
}): Promise<InitializeAdminResult> {
  const username = input.username.trim();
  if (username.length < 3 || username.length > 64) return { ok: false, reason: "INVALID_USERNAME" };
  if (input.password.length < 10 || input.password.length > 128) return { ok: false, reason: "WEAK_PASSWORD" };
  if (input.password !== input.confirmPassword) return { ok: false, reason: "PASSWORD_MISMATCH" };

  const status = await getAdminCredentialStatus();
  if (status.configurationError) return { ok: false, reason: "CONFIGURATION_ERROR" };
  if (status.configured) return { ok: false, reason: "ALREADY_CONFIGURED" };

  const passwordHash = await bcrypt.hash(input.password, 12);
  try {
    const created = await prisma.$transaction(async (tx) => {
      const existing = await tx.appSetting.count({ where: { key: { in: [...ADMIN_SETTING_KEYS] } } });
      if (existing) return false;
      await tx.appSetting.create({ data: { key: ADMIN_USERNAME_KEY, value: username } });
      await tx.appSetting.create({ data: { key: ADMIN_PASSWORD_HASH_KEY, value: passwordHash } });
      return true;
    });
    return created ? { ok: true } : { ok: false, reason: "ALREADY_CONFIGURED" };
  } catch {
    // A concurrent first-run submission may win the unique-key race.
    return { ok: false, reason: "ALREADY_CONFIGURED" };
  }
}

export const ADMIN_CREDENTIAL_SETTING_KEYS = ADMIN_SETTING_KEYS;
