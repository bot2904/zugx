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

test("radar: a train's run opens in a panel on the radar (?trip=), Esc closes it", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto("/radar");
  await page.getByText(/[1-9]\d* (trains|Züge)/).waitFor();
  const jid = "1|1|0|81|13112026"; // any id: the mock answers JourneyDetails from the fixture
  await page.goto(`/radar?trip=${encodeURIComponent(jid)}`);
  const panel = page.getByRole("complementary", { name: /Train run|Zuglauf|Percorso/ });
  await expect(panel).toBeVisible();
  await expect(panel.locator("ol li").nth(3)).toBeVisible();
  await expect(panel.getByRole("link", { name: /Open train run|Zuglauf öffnen/ })).toHaveAttribute(
    "href",
    `/train/${encodeURIComponent(jid)}`,
  );
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(page).not.toHaveURL(/trip=/);
});
