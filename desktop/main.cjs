/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const { spawn } = require("node:child_process");
const { randomBytes } = require("node:crypto");
const { appendFileSync, copyFileSync, existsSync, mkdirSync, openSync, closeSync, readFileSync, statSync, writeFileSync } = require("node:fs");
const net = require("node:net");
const path = require("node:path");

const APP_ID = "com.printx.desktop";
const isDevelopment = process.argv.includes("--development") || !app.isPackaged;
let mainWindow;
let splashWindow;
let serverProcess;
let appOrigin;
let runtimePaths;

function configureUserDataPath() {
  const override = process.env.PRINTX_DESKTOP_USER_DATA?.trim();
  const localBase = process.env.LOCALAPPDATA?.trim();
  const target = override || (localBase ? path.join(localBase, "PrintX") : null);
  if (target) app.setPath("userData", path.resolve(target));
}

configureUserDataPath();
app.setAppUserModelId(APP_ID);

function resolveRuntimePaths() {
  const root = app.getPath("userData");
  return {
    root,
    databaseDir: path.join(root, "database"),
    databaseFile: path.join(root, "database", "printx.db"),
    ordersDir: path.join(root, "storage", "orders"),
    sheetsDir: path.join(root, "storage", "print-sheets"),
    attachmentsDir: path.join(root, "storage", "attachments"),
    backupsDir: path.join(root, "backups"),
    logsDir: path.join(root, "logs"),
    configDir: path.join(root, "config"),
    tempDir: path.join(root, "temp"),
    storageSettingsFile: path.join(root, "config", "order-storage-settings.json"),
    backupSettingsFile: path.join(root, "config", "backup-settings-history.json"),
    adminSessionSecretFile: path.join(root, "config", "admin-session-secret"),
    migrationMarkerFile: path.join(root, "config", "last-migrated-version.txt"),
    logFile: path.join(root, "logs", "printx-desktop.log"),
  };
}

function log(message, error) {
  const suffix = error ? `\n${error instanceof Error ? error.stack || error.message : String(error)}` : "";
  const line = `[${new Date().toISOString()}] ${message}${suffix}\n`;
  try {
    if (runtimePaths) {
      mkdirSync(runtimePaths.logsDir, { recursive: true });
      appendFileSync(runtimePaths.logFile, line, "utf8");
    }
  } catch {
    // Diagnostics must never make startup fail.
  }
  if (isDevelopment) process.stdout.write(line);
}

function toPrismaFileUrl(filePath) {
  return `file:${path.resolve(filePath).replaceAll("\\", "/")}`;
}

function ensureRuntimeDirectories() {
  runtimePaths = resolveRuntimePaths();
  for (const directory of [runtimePaths.databaseDir, runtimePaths.ordersDir, runtimePaths.sheetsDir, runtimePaths.attachmentsDir, runtimePaths.backupsDir, runtimePaths.logsDir, runtimePaths.configDir, runtimePaths.tempDir]) {
    mkdirSync(directory, { recursive: true });
  }
  if (!existsSync(runtimePaths.databaseFile)) {
    const descriptor = openSync(runtimePaths.databaseFile, "a");
    closeSync(descriptor);
  }
  if (!existsSync(runtimePaths.storageSettingsFile)) {
    writeFileSync(runtimePaths.storageSettingsFile, JSON.stringify({ baseFolder: runtimePaths.ordersDir, printSheetFolder: runtimePaths.sheetsDir, retentionDays: 15 }, null, 2), "utf8");
  }
  if (!existsSync(runtimePaths.adminSessionSecretFile)) {
    writeFileSync(runtimePaths.adminSessionSecretFile, randomBytes(48).toString("base64url"), { encoding: "utf8", mode: 0o600 });
  }
}

function desktopEnvironment() {
  return {
    ...process.env,
    DATABASE_URL: toPrismaFileUrl(runtimePaths.databaseFile),
    PRINTX_DATABASE_PATH: runtimePaths.databaseFile,
    PRINTX_STORAGE_SETTINGS_PATH: runtimePaths.storageSettingsFile,
    PRINTX_BACKUP_SETTINGS_PATH: runtimePaths.backupSettingsFile,
    PRINTX_BACKUP_ROOT: runtimePaths.backupsDir,
    PRINTX_DESKTOP: "1",
    ADMIN_USERNAME: "",
    ADMIN_PASSWORD_HASH: "",
    ADMIN_SESSION_SECRET: readFileSync(runtimePaths.adminSessionSecretFile, "utf8").trim(),
    NODE_ENV: isDevelopment ? "development" : "production",
  };
}

function runChild(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, shell: false, ...options });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => { const value = chunk.toString(); stdout += value; log(value.trimEnd()); });
    child.stderr?.on("data", (chunk) => { const value = chunk.toString(); stderr += value; log(value.trimEnd()); });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`${path.basename(command)} exited with code ${code}.\n${stderr || stdout}`)));
  });
}

function prismaSchemaEnginePath() {
  return path.join(process.resourcesPath, "app.asar.unpacked", "node_modules", "@prisma", "engines", "schema-engine-windows.exe");
}

async function applyMigrations() {
  if (isDevelopment) return;
  const schemaPath = path.join(process.resourcesPath, "prisma", "schema.prisma");
  const prismaCli = path.join(app.getAppPath(), "node_modules", "prisma", "build", "index.js");
  if (!existsSync(schemaPath)) throw new Error(`Packaged Prisma schema is missing: ${schemaPath}`);

  const currentVersion = app.getVersion();
  const previousVersion = existsSync(runtimePaths.migrationMarkerFile) ? readFileSync(runtimePaths.migrationMarkerFile, "utf8").trim() : "";
  if (statSync(runtimePaths.databaseFile).size > 0 && previousVersion !== currentVersion) {
    const stamp = new Date().toISOString().replaceAll(":", "-");
    const safetyBackup = path.join(runtimePaths.backupsDir, `pre-migration-${previousVersion || "unknown"}-to-${currentVersion}-${stamp}.db`);
    copyFileSync(runtimePaths.databaseFile, safetyBackup);
    log(`Created migration safety backup: ${safetyBackup}`);
  }

  const env = { ...desktopEnvironment(), ELECTRON_RUN_AS_NODE: "1" };
  const enginePath = prismaSchemaEnginePath();
  if (existsSync(enginePath)) env.PRISMA_SCHEMA_ENGINE_BINARY = enginePath;
  log(`Applying Prisma migrations to ${runtimePaths.databaseFile}`);
  await runChild(process.execPath, [prismaCli, "migrate", "deploy", "--schema", schemaPath], { cwd: runtimePaths.root, env });
  writeFileSync(runtimePaths.migrationMarkerFile, currentVersion, "utf8");
  log("Prisma migrations completed.");
}

function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function waitForServer(url, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status < 500) return;
    } catch (error) { lastError = error; }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`PrintX server did not become ready at ${url}.`, { cause: lastError });
}

async function startServer() {
  const port = await findAvailablePort();
  appOrigin = `http://127.0.0.1:${port}`;
  if (isDevelopment) {
    const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
    serverProcess = spawn(npmCommand, ["run", "dev", "--", "-H", "127.0.0.1", "-p", String(port)], {
      cwd: path.resolve(__dirname, ".."), env: process.env, windowsHide: true, shell: false, stdio: ["ignore", "pipe", "pipe"],
    });
  } else {
    const serverEntry = path.join(process.resourcesPath, "app-server", "server.js");
    if (!existsSync(serverEntry)) throw new Error(`Packaged Next.js server is missing: ${serverEntry}`);
    serverProcess = spawn(process.execPath, [serverEntry], {
      cwd: runtimePaths.root,
      env: { ...desktopEnvironment(), ELECTRON_RUN_AS_NODE: "1", HOSTNAME: "127.0.0.1", PORT: String(port) },
      windowsHide: true, shell: false, stdio: ["ignore", "pipe", "pipe"],
    });
  }
  serverProcess.stdout?.on("data", (chunk) => log(`[server] ${chunk.toString().trimEnd()}`));
  serverProcess.stderr?.on("data", (chunk) => log(`[server:error] ${chunk.toString().trimEnd()}`));
  serverProcess.once("exit", (code, signal) => {
    log(`Local server exited (code=${code}, signal=${signal}).`);
    if (!app.isQuitting && mainWindow) {
      dialog.showErrorBox("PrintX server stopped", "The local PrintX server stopped unexpectedly. See the logs folder for details.");
      app.quit();
    }
  });
  serverProcess.once("error", (error) => log("Could not start local server.", error));
  await waitForServer(`${appOrigin}/dashboard`);
  log(`Local Next.js server ready at ${appOrigin}`);
}

function createSplashWindow() {
  splashWindow = new BrowserWindow({ width: 480, height: 250, resizable: false, frame: false, show: false, backgroundColor: "#020617", webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
  const markup = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#020617;color:#e2e8f0;font-family:Segoe UI,Arial,sans-serif;display:grid;place-items:center;height:100vh}.box{text-align:center}.logo{font-size:34px;font-weight:750;color:#38bdf8}.status{margin-top:18px;color:#94a3b8}.dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#38bdf8;animation:pulse 1s infinite alternate}@keyframes pulse{to{opacity:.25}}</style></head><body><div class="box"><div class="logo">PrintX</div><div class="status"><span class="dot"></span>&nbsp; Starting desktop beta...</div></div></body></html>`;
  splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(markup)}`);
  splashWindow.once("ready-to-show", () => splashWindow?.show());
}

function isTrustedSender(event) {
  try { return Boolean(appOrigin) && new URL(event.senderFrame.url).origin === appOrigin; } catch { return false; }
}

function registerIpc() {
  ipcMain.handle("printx:get-version", (event) => { if (!isTrustedSender(event)) throw new Error("Untrusted desktop request."); return app.getVersion(); });
  ipcMain.handle("printx:get-user-data-path", (event) => { if (!isTrustedSender(event)) throw new Error("Untrusted desktop request."); return runtimePaths.root; });
  ipcMain.handle("printx:select-folder", async (event) => {
    if (!isTrustedSender(event)) throw new Error("Untrusted desktop request.");
    const result = await dialog.showOpenDialog(mainWindow, { properties: ["openDirectory", "createDirectory"] });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle("printx:open-path", async (event, value) => {
    if (!isTrustedSender(event) || typeof value !== "string" || !path.isAbsolute(value)) throw new Error("Invalid path.");
    return shell.openPath(path.resolve(value));
  });
  ipcMain.handle("printx:show-item-in-folder", (event, value) => {
    if (!isTrustedSender(event) || typeof value !== "string" || !path.isAbsolute(value)) throw new Error("Invalid path.");
    shell.showItemInFolder(path.resolve(value));
  });
  ipcMain.handle("printx:open-logs", (event) => { if (!isTrustedSender(event)) throw new Error("Untrusted desktop request."); return shell.openPath(runtimePaths.logsDir); });
  ipcMain.handle("printx:restart", (event) => { if (!isTrustedSender(event)) throw new Error("Untrusted desktop request."); app.relaunch(); app.quit(); });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    title: "PrintX", width: 1500, height: 980, minWidth: 1180, minHeight: 760, show: false, backgroundColor: "#020617", autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: false },
  });
  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  mainWindow.webContents.on("will-navigate", (event, url) => { if (!url.startsWith(`${appOrigin}/`)) event.preventDefault(); });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(`${appOrigin}/`)) mainWindow.loadURL(url);
    else if (url.startsWith("https://")) shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.once("ready-to-show", () => { splashWindow?.close(); splashWindow = undefined; mainWindow.show(); if (!isDevelopment) mainWindow.maximize(); });
  mainWindow.on("closed", () => { mainWindow = undefined; });
  mainWindow.loadURL(`${appOrigin}/dashboard`);
}

const hasInstanceLock = app.requestSingleInstanceLock();
if (!hasInstanceLock) app.quit();
else {
  app.on("second-instance", () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); } });
  app.whenReady().then(async () => {
    try {
      app.isQuitting = false;
      ensureRuntimeDirectories();
      log(`Starting PrintX Desktop ${app.getVersion()}`);
      log(`User data: ${runtimePaths.root}`);
      createSplashWindow();
      registerIpc();
      await applyMigrations();
      await startServer();
      createMainWindow();
    } catch (error) {
      log("PrintX desktop startup failed.", error);
      splashWindow?.close();
      dialog.showErrorBox("PrintX could not start", `${error instanceof Error ? error.message : String(error)}\n\nLogs: ${runtimePaths?.logFile || app.getPath("userData")}`);
      app.quit();
    }
  });
}

app.on("before-quit", () => { app.isQuitting = true; });
app.on("window-all-closed", () => app.quit());
app.on("quit", () => { if (serverProcess && !serverProcess.killed) serverProcess.kill(); log("PrintX Desktop stopped."); });
process.on("uncaughtException", (error) => log("Uncaught Electron error.", error));
process.on("unhandledRejection", (error) => log("Unhandled Electron rejection.", error));
