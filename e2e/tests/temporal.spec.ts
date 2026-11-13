// Temporal: native where available, polyfill chunk otherwise (apps/web/src/main.ts)
import { expect, test } from "@playwright/test";
import { mockApi } from "./mock.ts";
test("works with the polyfill (no native Temporal)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const polyfill: string[] = [];
  page.on("request", (r) => r.url().includes("global.esm") && polyfill.push(r.url()));
  await page.addInitScript(() => {
    // @ts-expect-error simulate a browser without Temporal
    delete globalThis.Temporal;
  });
  await mockApi(page);
  await page.goto("/station/8103000");
  await expect(page.locator("table.dense tbody tr[data-row]").first()).toBeVisible();
  await page.goto("/j/8103000/8100173");
  await expect(page.locator("svg[aria-label=timeline]")).toBeVisible();
  await page.goto("/bf/westbahn?from=7&h=2");
  await expect(page.locator("svg[role=img] path").first()).toBeVisible();
  await page.goto("/trains?q=transalpin");
  await expect(page.getByText("»Transalpin«").first()).toBeVisible();
  expect(polyfill.length).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
test("native Temporal: the polyfill is not downloaded", async ({ page }) => {
  const polyfill: string[] = [];
  page.on("request", (r) => r.url().includes("global.esm") && polyfill.push(r.url()));
  await mockApi(page);
  await page.goto("/");
  test.skip(
    !(await page.evaluate(() => "Temporal" in globalThis)),
    "browser without native Temporal",
  );
  await page.locator("#from").waitFor();
  expect(polyfill).toEqual([]);
});
