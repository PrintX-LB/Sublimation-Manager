import { expect, test } from "@playwright/test";

test("opens the administration dashboard without a login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Command Center" })).toBeVisible();
  await expect(page.getByText("Local workspace")).toBeVisible();
});

test("provides accessible administration navigation", async ({ page }) => {
  await page.goto("/dashboard");
  const menuButton = page.getByRole("button", { name: "Open navigation" });
  if (await menuButton.isVisible()) await menuButton.click();
  const navigation = page.getByRole("navigation", { name: "Administration" });
  await expect(
    navigation.getByRole("link", { name: "Customers" }),
  ).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Inventory" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Orders" })).toBeVisible();
});

test("creates and edits a customer", async ({ page }, testInfo) => {
  const suffix = `${testInfo.project.name.replace(/\W/g, "-")}-${Date.now()}`;
  const originalName = `Phase Two Customer ${suffix}`;
  await page.goto("/customers/new");
  await page.getByLabel("Full name").fill(originalName);
  await page.getByLabel("Telephone").fill("+34 600 123 456");
  await page.getByLabel("Email").fill(`${suffix}@customer.test`);
  await page.getByRole("button", { name: "Save customer" }).click();
  await expect(page.getByRole("heading", { name: originalName })).toBeVisible();
  await expect(page.getByText(/CUS-\d{6}/)).toBeVisible();

  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByLabel("Full name").fill(`${originalName} Edited`);
  await page.getByLabel("City").fill("Madrid");
  await page.getByRole("button", { name: "Save customer" }).click();
  await expect(
    page.getByRole("heading", { name: `${originalName} Edited` }),
  ).toBeVisible();
  await expect(page.getByText("Madrid")).toBeVisible();
});

test("creates and edits a product with a variant", async ({
  page,
}, testInfo) => {
  const suffix = `${testInfo.project.name.replace(/\W/g, "-")}-${Date.now()}`;
  const category = `Drinkware ${suffix}`;
  await page.goto("/products/categories");
  await page.getByPlaceholder("Category name").first().fill(category);
  await page.getByRole("button", { name: "Add category" }).click();
  await expect(page.getByRole("status")).toHaveText("Category saved.");

  await page.goto("/products/new");
  await page.getByLabel("Product name").fill(`Phase Two Mug ${suffix}`);
  const categoryPicker = page.getByPlaceholder("Search categories...");
  await categoryPicker.fill(category);
  await page.getByRole("option", { name: category }).click();
  await page.getByLabel("Selling price").fill("15.00");
  await page.getByLabel("Production cost").fill("5.00");
  await page.getByLabel("Current stock").fill("2");
  await page.getByLabel("Low-stock threshold").fill("3");
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(
    page.getByRole("heading", { name: `Phase Two Mug ${suffix}` }),
  ).toBeVisible();
  await expect(page.getByText("$10.00 · 66.6%")).toBeVisible();

  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByLabel("Product name").fill(`Phase Two Mug ${suffix} Edited`);
  await page.getByLabel("Selling price").fill("16.00");
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(
    page.getByRole("heading", { name: `Phase Two Mug ${suffix} Edited` }),
  ).toBeVisible();
  await expect(page.getByText("$11.00 · 68.7%")).toBeVisible();
});
