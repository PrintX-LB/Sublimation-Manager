import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const root = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\//, ""));
const portablePath = (value) => value.replace(/^\\\\\?\\/, "");
const workspace = await mkdir(path.join(os.tmpdir(), `printx-playwright-${Date.now()}`), { recursive: true });
const dbPath = path.join(workspace, "sublimation.db");
const storageRoot = path.join(workspace, "uploads");
const sheetsRoot = path.join(workspace, "print-sheets");
const env = { ...process.env, DATABASE_URL: `file:${portablePath(dbPath).replaceAll("\\", "/")}`, PRINTX_STORAGE_SETTINGS_PATH: path.join(workspace, "order-storage-settings.json"), PRINTX_BACKUP_SETTINGS_PATH: path.join(workspace, "backup-settings-history.json") };
await writeFile(dbPath, Buffer.alloc(0));
await writeFile(env.PRINTX_STORAGE_SETTINGS_PATH, JSON.stringify({ baseFolder: storageRoot, printSheetFolder: sheetsRoot, retentionDays: 15 }));
await mkdir(storageRoot, { recursive: true });
await mkdir(sheetsRoot, { recursive: true });

const migration = spawnSync(process.execPath, [path.join(root, "node_modules", "prisma", "build", "index.js"), "migrate", "deploy"], { cwd: root, env, stdio: "inherit", windowsHide: true });
if (migration.status !== 0) {
  await rm(workspace, { recursive: true, force: true });
  process.exit(migration.status ?? 1);
}

const server = spawn(process.execPath, [path.join(root, "node_modules", "next", "dist", "bin", "next"), "dev"], { cwd: root, env, stdio: "inherit", windowsHide: true });
const cleanup = async () => {
  if (!server.killed) server.kill();
  await rm(workspace, { recursive: true, force: true });
};
process.once("SIGINT", () => void cleanup().finally(() => process.exit(130)));
process.once("SIGTERM", () => void cleanup().finally(() => process.exit(143)));
server.once("exit", (code) => void cleanup().finally(() => process.exit(code ?? 0)));
