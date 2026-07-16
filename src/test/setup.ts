import "@testing-library/jest-dom/vitest";
import { copyFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { afterAll } from "vitest";
import { vi } from "vitest";

// Server Actions call Next's cache API in production. In Vitest there is no
// Next request context, so keep those calls as quiet no-op mocks.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

// Isolate test database during unit/integration tests execution
if (process.env.VITEST) {
  // Vitest does not always expose VITEST_POOL_ID for forked workers. A
  // process-specific fallback prevents concurrent files from sharing the
  // same SQLite copy and backup-settings history.
  const poolId = `${process.env.VITEST_POOL_ID || "1"}-${process.pid}`;
  process.env.VITEST_POOL_ID = poolId;
  try {
    const dbPath = path.resolve(process.cwd(), "data", "sublimation.db");
    const testDbPath = path.resolve(process.cwd(), "data", `sublimation_test_${poolId}.db`);
    copyFileSync(dbPath, testDbPath);
  } catch (err) {
    console.error(`Failed to copy sublimation.db for test pool ${poolId}:`, err);
  }
  process.env.DATABASE_URL = `file:../data/sublimation_test_${poolId}.db`;

  // Keep unit/integration tests from leaving data or settings in the development
  // workspace. The test database is a copy and is never the live database.
  afterAll(async () => {
    const { prisma } = await import("@/lib/db/prisma");
    if (typeof prisma.$disconnect === "function") await prisma.$disconnect();
    const dataDir = path.resolve(process.cwd(), "data");
    await Promise.all([
      rm(path.join(dataDir, `sublimation_test_${poolId}.db`), { force: true }),
      rm(path.join(dataDir, `backup-settings-history-test-${poolId}.json`), { force: true }),
      rm(path.join(dataDir, `order-storage-settings-test-${poolId}.json`), { force: true }),
    ].map((operation) => operation.catch((error: unknown) => {
      console.warn("Test isolation cleanup could not remove a temporary file", error);
    })));
  });
}
