import { access, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");
const staticFiles = path.join(root, ".next", "static");
const publicFiles = path.join(root, "public");
const outputRoot = path.join(root, "desktop-dist");
const appServer = path.join(outputRoot, "app-server");

async function requirePath(target, description) {
  try { await access(target); }
  catch { throw new Error(`${description} is missing at ${target}. Run the production build before preparing the desktop package.`); }
}

await requirePath(path.join(standalone, "server.js"), "Next.js standalone server");
await requirePath(staticFiles, "Next.js static assets");
await requirePath(publicFiles, "Public assets");
await rm(outputRoot, { recursive: true, force: true });
await mkdir(appServer, { recursive: true });
await cp(standalone, appServer, { recursive: true });
for (const runtimeOnlyPath of [".env", ".env.local", "data", "uploads", "backups", "print-sheets", "test-results", "playwright-report"]) {
  await rm(path.join(appServer, runtimeOnlyPath), { recursive: true, force: true });
}
await mkdir(path.join(appServer, ".next"), { recursive: true });
await cp(staticFiles, path.join(appServer, ".next", "static"), { recursive: true });
await cp(publicFiles, path.join(appServer, "public"), { recursive: true });

const packageData = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
await writeFile(path.join(outputRoot, "desktop-build.json"), JSON.stringify({ product: "PrintX", version: packageData.version, preparedAt: new Date().toISOString(), includesUserData: false }, null, 2), "utf8");
console.log(`Prepared the standalone PrintX server at ${appServer}`);
console.log("No database, artwork, backup, upload, or generated sheet data was included.");
