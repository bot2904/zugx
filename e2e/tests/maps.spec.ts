import { expect, test } from "@playwright/test";
import { mockApi } from "./mock.ts";
test("radar: railway map on for first-time visitors", async ({ page }) => {
  await mockApi(page);
  const orm: string[] = [];
  page.on("request", (r) => r.url().includes("openrailwaymap.org") && orm.push(r.url()));
  await page.goto("/radar");
  const btn = page.getByRole("button", { name: /Railway map|Bahnkarte|ferroviaria/ });
  await expect(btn).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => orm.length).toBeGreaterThan(0);
});
