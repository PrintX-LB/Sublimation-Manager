import { existsSync, readdirSync, statSync, rmSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const retainedRelease = process.env.PRINTX_RETAINED_RELEASE || "release-artwork-fix";

function insideRoot(relativePath) {
  const target = path.resolve(root, relativePath);
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Refusing unsafe maintenance target: ${target}`);
  }
  return target;
}

function remove(relativePath) {
  const target = insideRoot(relativePath);
  if (existsSync(target)) {
    rmSync(target, { recursive: true, force: true });
    console.log(`Removed ${relativePath}`);
  }
}

function bytes(target) {
  if (!existsSync(target)) return 0;
  const info = statSync(target);
  if (info.isFile()) return info.size;
  return readdirSync(target, { withFileTypes: true })
    .reduce((total, entry) => total + bytes(path.join(target, entry.name)), 0);
}

function audit() {
  const entries = readdirSync(root, { withFileTypes: true })
    .map((entry) => ({ name: entry.name, size: bytes(path.join(root, entry.name)) }))
    .sort((a, b) => b.size - a.size);
  console.log(`Repository: ${root}`);
  console.log(`Total: ${(entries.reduce((sum, entry) => sum + entry.size, 0) / 1e9).toFixed(2)} GB`);
  for (const entry of entries.slice(0, 20)) {
    console.log(`${(entry.size / 1e6).toFixed(1).padStart(10)} MB  ${entry.name}`);
  }
}

const command = process.argv[2] || "audit";
if (command === "audit") audit();
else if (command === "clean-build") {
  remove(".next");
  remove("desktop-dist");
} else if (command === "clean-test") {
  for (const target of ["playwright-report", "test-results", "coverage"]) remove(target);
  for (const name of readdirSync(path.join(root, "data"), { withFileTypes: true })) {
    if (name.isFile() && /^sublimation_test.*\.db(-journal|-wal|-shm)?$/i.test(name.name)) remove(path.join("data", name.name));
  }
} else if (command === "clean-release") {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory() && /^release(?:-.+)?$/i.test(entry.name) && entry.name !== retainedRelease) remove(entry.name);
  }
  const retainedPath = insideRoot(retainedRelease);
  if (existsSync(retainedPath)) {
    for (const entry of readdirSync(retainedPath, { withFileTypes: true })) {
      if (entry.isFile() && (entry.name === "builder-debug.yml" || entry.name.endsWith(".blockmap") || entry.name.endsWith(".nsis.7z"))) {
        remove(path.join(retainedRelease, entry.name));
      }
    }
  }
} else if (command === "clean") {
  for (const task of ["clean-build", "clean-test", "clean-release"]) {
    const result = process.spawnSync(process.execPath, [process.argv[1], task], { stdio: "inherit" });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
} else {
  throw new Error(`Unknown maintenance command: ${command}`);
}
