import { expect, test } from "@playwright/test";

test.describe("release-readiness production smoke", () => {
  test("starts with an empty production workspace", async ({ page }) => {
    await page.goto("/production");
    await expect(page.getByRole("heading", { name: "Production Board" })).toBeVisible();

    await page.goto("/production/sheets/queue");
    await expect(page.getByRole("heading", { name: "Automatic Sheet Pairing" })).toBeVisible();
    await expect(page.getByText(/No compatible Ready to Print attempts are waiting/i)).toBeVisible();

    await page.goto("/production/sheets");
    await expect(page.getByRole("heading", { name: "Generated Print Sheets" })).toBeVisible();
    await expect(page.getByText("No generated sheets found.")).toBeVisible();
  });

  test("exposes backup, inventory and production controls", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByText("Backup & Restore")).toBeVisible();
    await expect(page.getByRole("button", { name: /Create Backup Snapshot/i })).toBeVisible();

    await page.goto("/inventory?tab=materials");
    await expect(page.getByRole("heading", { name: "Inventory" })).toBeVisible();

    await page.goto("/production");
    await expect(page.getByRole("link", { name: "Generated Print Sheets" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Automatic Pairing Queue" })).toBeVisible();
  });
});
