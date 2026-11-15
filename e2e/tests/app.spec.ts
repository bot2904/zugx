import { readFileSync } from "node:fs";
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
  await page.locator("#from").waitFor();
  await page.locator("body").click();
  await page.keyboard.press("Control+k");
  await expect(page.locator("dialog[open] input")).toBeFocused();
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
  await page
    .getByRole("button", { name: /Swap direction|Richtung tauschen|Inverti direzione/ })
    .click();
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
  await expect(page.getByRole("columnheader", { name: /^(Pl\.|Bst\.|Bin\.)/ })).toHaveAttribute(
    "aria-sort",
    "ascending",
  );
  await expect(
    page.getByRole("columnheader", { name: /^(Pl\.|Bst\.|Bin\.)/ }).getByRole("button"),
  ).toBeFocused();
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
  await page.locator("#from").waitFor(); // app mounted, shortcuts registered
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

test("accessibility basics: lang, skip link, named controls", async ({ page }) => {
  await page.goto("/station/8103000");
  await expect(page.locator("html")).toHaveAttribute("lang", /^(en|de|it)$/);
  await page.keyboard.press("Tab");
  await expect(page.locator(".skip-link")).toBeFocused();
  // every button and text input has an accessible name
  for (const el of await page
    .locator("button, input:not([type=checkbox]):not([type=hidden])")
    .all()) {
    if (!(await el.isVisible())) continue;
    const name = await el.evaluate(
      (e) =>
        (e as HTMLElement).ariaLabel ||
        e.textContent?.trim() ||
        (e as HTMLInputElement).labels?.[0]?.textContent?.trim() ||
        e.getAttribute("title"),
    );
    expect(name, await el.evaluate((e) => e.outerHTML.slice(0, 120))).toBeTruthy();
  }
});

test("connection permalink with #n scrolls the opened connection into view", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 500 });
  await page.goto("/j/8103000/8100173#2");
  const details = page.locator("article.card");
  await expect(details).toBeVisible();
  await expect(details).toBeInViewport();
});

test("running-days toggletip opens next to its button and stays anchored while scrolling", async ({
  page,
}) => {
  await page.goto("/trains?q=transalpin");
  const btn = page.locator(".toggletip-btn").first();
  await btn.click();
  const tip = page.locator(".toggletip:popover-open");
  await expect(tip).toBeVisible();
  const gap = async () => {
    const [b, t] = await Promise.all([btn.boundingBox(), tip.boundingBox()]);
    return Math.min(Math.abs(t!.y - (b!.y + b!.height)), Math.abs(b!.y - (t!.y + t!.height)));
  };
  expect(await gap()).toBeLessThan(12);
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(200);
  if (await tip.isVisible()) expect(await gap()).toBeLessThan(12);
});

test("footer links imprint and privacy policy (German version authoritative)", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /^(Imprint|Impressum|Note legali)$/ }).click();
  await expect(page).toHaveURL(/\/imprint$/);
  await expect(page.locator("h1")).toHaveText(/Imprint|Impressum/);
  await expect(page.getByText("Innsbruck")).toBeVisible();
  await page
    .getByRole("link", { name: /^(Privacy|Datenschutz)/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/privacy$/);
  await page.getByRole("link", { name: "German version" }).click();
  await expect(page.locator("h1")).toHaveText("Datenschutzerklärung");
  await page.goto("/impressum");
  await expect(page).toHaveURL(/\/imprint$/);
});

test("bildfahrplan hover shows train, departure station and destination", async ({ page }) => {
  await page.goto("/bf/westbahn?from=7&h=2&d=2026-03-10");
  const train = page.locator("svg[role=img] g.cursor-pointer").first();
  await train.waitFor({ state: "attached" });
  await train.dispatchEvent("mouseenter"); // the first run may lie partly outside the clipped plot
  await expect(page.locator("p.mono").filter({ hasText: "→" })).toHaveText(/\S+ \d+\s+.+ → .+/);
});

test("netzgrafik opens the Netzgrafik-Editor with the network in the URL fragment", async ({
  page,
  context,
}) => {
  await context.route("https://openrailassociation.github.io/**", (r) =>
    r.fulfill({ contentType: "text/html", body: "<title>NGE</title>" }),
  );
  await page.goto("/netz");
  const [popup] = await Promise.all([
    page.waitForEvent("popup"),
    page.getByRole("link", { name: /Netzgrafik-Editor/ }).click(),
  ]);
  await popup.waitForURL(/#netzgrafik=/);
  const data = new URL(popup.url()).hash.replace("#netzgrafik=", "");
  expect(data).toMatch(/^[\w-]{1000,}$/);
});

test("station board: Later appends the next departures and keeps the shown ones", async ({
  page,
}) => {
  // the 2nd StationBoard request answers with the same trains one day later (new entries)
  const fixture = JSON.parse(
    readFileSync(
      new URL("../../packages/hafas/fixtures/station-board.json", import.meta.url),
      "utf8",
    ),
  ).response;
  let boards = 0;
  await page.route("**/api/mgate", async (route) => {
    const req = route.request().postDataJSON().svcReqL[0];
    if (req.meth !== "StationBoard" || req.req.type === "ARR") return route.fallback();
    const res = structuredClone(fixture);
    if (boards++ > 0) for (const j of res.svcResL[0].res.jnyL) j.date = String(Number(j.date) + 1);
    await route.fulfill({ json: res });
  });
  await page.goto("/station/8103000");
  const rows = page.locator("table.dense tbody tr[data-row]");
  await rows.first().waitFor();
  const n = await rows.count();
  const first = (await rows.first().textContent()) ?? "";
  await page.getByRole("button", { name: /^(Later|Später|Dopo)/ }).click();
  await expect(rows).toHaveCount(2 * n);
  await expect(rows.first()).toHaveText(first);
  await expect(page).not.toHaveURL(/[?&]t=/);
});

test("bildfahrplan: station menu (departure board, Wikidata via IBNR) and Wikidata railway lines", async ({
  page,
}) => {
  await page.goto("/bf/500?from=14&h=2&d=2026-03-10");
  await page.locator("svg[role=img] path").first().waitFor();
  // sheet lines resolved from Wikidata at build time (P954 → P81), linked to DinoData
  await expect(page.getByRole("link", { name: /^Semmeringbahn/ })).toHaveAttribute(
    "href",
    /^https:\/\/dinodata\.toolforge\.org\/#Q\d+$/,
  );
  await page
    .locator("a.bf-station")
    .filter({ has: page.locator("title", { hasText: /^Semmering$/ }) })
    .click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /Wikidata/ })).toHaveAttribute(
    "href",
    "https://dinodata.toolforge.org/#P954=8100028",
  );
  await menu.getByRole("menuitem", { name: /Departures|Abfahrten|Partenze/ }).click();
  await expect(page).toHaveURL(/\/station\/8100028/);
  await expect(page.getByRole("link", { name: /Wikidata/ })).toHaveAttribute(
    "href",
    "https://dinodata.toolforge.org/#P954=8100028",
  );
});

test("VzG index filters by line number and station, opens a line", async ({ page }) => {
  await page.goto("/vzg");
  await expect(page.locator("h1 abbr")).toHaveAttribute(
    "title",
    "Verzeichnis der örtlich zulässigen Geschwindigkeiten und Besonderheiten",
  );
  await page.getByRole("searchbox").fill("10101");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("searchbox").fill("Maria Anzbach");
  await expect(page.locator("tbody tr").first()).toContainText("101 01");
  await page.getByRole("searchbox").press("Enter");
  await expect(page).toHaveURL(/\/vzg\/101-01/);
  const svg = page.locator("svg.vzg");
  await expect(svg.locator("text", { hasText: "Maria Anzbach" })).toBeVisible();
  // Regelgleis 2 (direction of decreasing km): speed changes of the ÖBB VzG page
  await page.getByRole("button", { name: "2", exact: true }).click();
  await expect(page).toHaveURL(/t=2/);
  for (const km of ["30.558", "32.863", "34.629"])
    await expect(svg.locator("text", { hasText: km })).toHaveCount(1);
});

test("bildfahrplan live overlay: only for today, toggles ?live=1", async ({ page }) => {
  await page.goto("/bf/westbahn?from=7&h=2&d=2026-03-10");
  const live = page.getByRole("button", { name: /Live|Echtzeit|Tempo reale/ });
  await expect(live).toBeDisabled();
  await page.goto("/bf/westbahn?from=7&h=2");
  await live.click();
  await expect(page).toHaveURL(/live=1/);
  await expect(live).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("status")).toBeVisible();
});

test("VzG also lists railways without an ÖBB line number", async ({ page }) => {
  await page.goto("/vzg?q=fulpmes");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody tr").first()).toContainText("1000 mm");
  await page.getByRole("searchbox").press("Enter");
  await expect(page).toHaveURL(/\/vzg\/stubaitalbahn/);
  await expect(page.locator("svg.vzg text", { hasText: "Fulpmes" }).first()).toBeVisible();
});

test("bildfahrplan keeps date and time window when switching sheets via the index", async ({
  page,
}) => {
  await page.goto("/bf/westbahn?from=7&h=2&d=2026-03-10");
  await expect(page).toHaveURL(/\/bf\/[^?]+\?.*d=2026-03-10/);
  await page.goto("/bf");
  await page.locator("tbody tr td:nth-child(2) a").nth(3).click();
  await expect(page).toHaveURL(/\/bf\/[^?]+\?/);
  await expect(page).toHaveURL(/d=2026-03-10/);
  await expect(page).toHaveURL(/from=7/);
  await expect(page).toHaveURL(/h=2/);
});
