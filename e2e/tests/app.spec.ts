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

test("station autocomplete uses the local index", async ({ page }) => {
  await page.goto("/");
  await page.locator("#from").fill("innsbr");
  await expect(page.locator("[role=listbox] [role=option]").first()).toContainText("Innsbruck Hbf");
});

test("train index lists trains and filters", async ({ page }) => {
  await page.goto("/trains?q=transalpin");
  await expect(page.getByText("»Transalpin«").first()).toBeVisible();
});

test("bildfahrplan and netzgrafik render", async ({ page }) => {
  await page.goto("/bf/westbahn?from=7&h=2");
  await expect(page.locator("svg[role=img] path").first()).toBeVisible();
  await page.goto("/netz");
  await expect(page.locator("svg text", { hasText: "Salzburg Hbf" }).first()).toBeVisible();
});

test("train index search matches intermediate stops", async ({ page }) => {
  await page.goto("/trains?q=zell%20am%20see");
  await expect(page.getByText("EC 164").first()).toBeVisible();
});

test("add to calendar downloads an .ics with deep link", async ({ page }) => {
  await page.goto("/j/8103000/8100173#1");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /calendar|Kalender|calendario/i }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.ics$/);
  const ics = await (
    await download.createReadStream()
  )
    .toArray()
    .then((c) => Buffer.concat(c).toString("utf8"));
  const unfolded = ics.replace(/\r\n /g, "");
  expect(unfolded).toContain("BEGIN:VEVENT");
  expect(unfolded).toMatch(/^SUMMARY:.+→.+·/m);
  expect(unfolded).toMatch(/^URL:http:\/\/127\.0\.0\.1:5188\/trip\/[\w-]+$/m);
});

test("bildfahrplan index filters by station", async ({ page }) => {
  await page.goto("/bf?q=horn");
  const link = page.getByRole("link", { name: /Krems.*Horn.*Sigmundsherberg/ });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/\/bf\/820/);
  // old corridor ids redirect to their ÖBB Fahrplanbild
  await page.goto("/bf/kamptal");
  await expect(page).toHaveURL(/\/bf\/820/);
});

test("radar draws trains without map errors (worker loads in the production build)", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/radar");
  await expect(page.getByText(/[1-9]\d* (trains|Züge)/)).toBeVisible();
  await page.waitForTimeout(1000);
  expect(errors.filter((e) => /worker/i.test(e))).toEqual([]);
});

test("bildfahrplan section and direction are adjustable", async ({ page }) => {
  await page.goto("/bf/101?from=7&h=2&d=2026-03-10");
  await page.locator("svg[role=img] path").first().waitFor();
  const pickers = page.locator("select.input.max-w-56");
  await pickers.nth(0).selectOption({ label: "Attnang-Puchheim" });
  await expect(page).toHaveURL(/a=Pat/);
  await page.getByRole("button", { name: "⇄" }).click();
  await expect(page).toHaveURL(/rev=1/);
  await expect(pickers.nth(0)).toHaveValue(
    (await pickers.nth(0).locator("option").first().getAttribute("value")) as string,
  );
});

test("bildfahrplan index keeps its sort order after visiting a corridor", async ({ page }) => {
  await page.goto("/bf");
  await page.getByRole("columnheader", { name: /^km/ }).click();
  await expect(page).toHaveURL(/sort=km/);
  const first = (
    await page.locator("tbody tr").first().getByRole("link").nth(1).innerText()
  ).trim();
  await page.locator("tbody tr").first().getByRole("link").nth(1).click();
  await expect(page).toHaveURL(/\/bf\/[^?]/);
  await page.goBack();
  await expect(page).toHaveURL(/sort=km/);
  await expect(page.locator("tbody tr").first().getByRole("link").nth(1)).toHaveText(first);
});

test("station board columns are sortable", async ({ page }) => {
  await page.goto("/station/8103000");
  await page.locator("table.dense tbody tr[data-row]").first().waitFor();
  await page.getByRole("columnheader", { name: /^(Pl\.|Bst\.|Bin\.)/ }).click();
  await expect(page).toHaveURL(/sort=platform/);
  const platforms = await page
    .locator("table.dense tbody tr[data-row] td:last-child")
    .allInnerTexts();
  const shown = platforms.map((p) => p.trim()).filter(Boolean);
  const sorted = [...shown].sort(
    new Intl.Collator(undefined, { numeric: true, sensitivity: "base" }).compare,
  );
  expect(shown).toEqual(sorted);
  await page.getByRole("columnheader", { name: /^(Pl\.|Bst\.|Bin\.)/ }).click();
  await expect(page).toHaveURL(/desc=1/);
});

test("footer links the open source licenses (production build, also with the service worker active)", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("link", {
      name: /open source licenses|Open-Source-Lizenzen|licenze open source/,
    }),
  ).toHaveAttribute("href", "/licenses.txt");
  await page.evaluate(() => navigator.serviceWorker?.ready);
  await page.goto("/licenses.txt");
  await expect(page.locator("body")).toContainText("maplibre-gl");
});

test("command palette is a native modal dialog (Esc and backdrop close it)", async ({ page }) => {
  await page.goto("/");
  await page.locator("body").click();
  await page.keyboard.press("Control+k");
  const dlg = page.locator("dialog[open]");
  await expect(dlg).toBeVisible();
  await expect(dlg.locator("input")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dlg).toHaveCount(0);
  await page.keyboard.press("Control+k");
  await expect(page.locator("dialog[open]")).toBeVisible();
  await page.mouse.click(5, 5); // backdrop
  await expect(page.locator("dialog[open]")).toHaveCount(0);
});
