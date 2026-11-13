import { expect, test } from "@playwright/test";
import { mockApi } from "./mock.ts";

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test("home shows search form", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("combobox").first()).toBeVisible();
  await expect(page.locator("h1")).toContainText("zugx");
});

test("station board lists departures with delays", async ({ page }) => {
  await page.goto("/station/8103000");
  const rows = page.locator("table.dense tbody tr[data-row]");
  await expect(rows.first()).toBeVisible();
  expect(await rows.count()).toBeGreaterThan(3);
  await expect(page.locator("sup").first()).toBeVisible();
});

test("journeys render timeline and details", async ({ page }) => {
  await page.goto("/j/8103000/8100173");
  await expect(page.locator("svg[aria-label=timeline]")).toBeVisible();
  await page.locator("svg[aria-label=timeline] g.cursor-pointer").first().click();
  await expect(page.getByText(/Details|Dettagli/)).toBeVisible();
  // table view toggle
  await page.keyboard.press("v");
  await expect(page.locator("table.dense")).toBeVisible();
});

test("train page by number", async ({ page }) => {
  await page.goto("/train/RJX-162");
  // JourneyMatch → JourneyDetails (fixture is a different train, so only check the structure)
  await expect(page.locator("h1")).toContainText("→");
  await expect(page.locator("ol li").nth(5)).toBeVisible();
  await expect(page.locator("svg[role=img]").first()).toBeVisible();
});

test("disruptions", async ({ page }) => {
  await page.goto("/him");
  await expect(page.locator("article").first()).toBeVisible();
});

test("command palette jumps to a train", async ({ page }) => {
  await page.goto("/");
  await page.locator("body").click();
  await page.keyboard.press("Control+k");
  await page.keyboard.type("RJX 162");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/train\/RJX-162/);
});

test("raw API view shows request/response", async ({ page }) => {
  await page.goto("/station/8103000");
  await page.locator("table.dense").waitFor();
  await page.locator("body").click();
  await page.keyboard.press("d");
  await expect(page.getByText("StationBoard").first()).toBeVisible();
});

test("language switch", async ({ page }) => {
  await page.goto("/station/8103000");
  await page.getByLabel(/Language|Sprache|Lingua/).selectOption("de");
  await expect(page.getByText("Abfahrten").first()).toBeVisible();
});
