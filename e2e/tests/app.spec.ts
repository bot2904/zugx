import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

test("bildfahrplan hover tooltip shows train, departure station and destination", async ({
  page,
}) => {
  await page.goto("/bf/westbahn?from=7&h=2&d=2026-03-10");
  const train = page.locator("svg[role=img] g.cursor-pointer").first();
  await train.waitFor({ state: "attached" });
  // the first run may lie partly outside the clipped plot: synthetic mouse hover
  await train.dispatchEvent("pointerenter", { pointerType: "mouse", clientX: 300, clientY: 300 });
  const tip = page.getByRole("tooltip");
  await expect(tip.locator("strong")).toHaveText(/^\S+ \d+$/);
  await expect(tip).toContainText(" → ");
  // hovered train emphasised (drawn again on top), the others faded
  await train.dispatchEvent("mouseenter");
  await expect(page.locator("svg[role=img] path[stroke-width='3']").first()).toBeAttached();
  await expect(train.locator("path").nth(1)).toHaveAttribute("opacity", "1");
  await expect(
    page.locator("svg[role=img] g.cursor-pointer").nth(1).locator("path").nth(1),
  ).toHaveAttribute("opacity", "0.35");
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

test("bildfahrplan: station name opens its departure board; VzG railway lines", async ({
  page,
}) => {
  await page.goto("/bf/500?from=14&h=2&d=2026-03-10");
  await page.locator("svg[role=img] path").first().waitFor();
  // sheet lines: the VzG lines through its stations (build time), linked to the VzG chart
  await expect(page.getByRole("link", { name: /^105 01/ })).toHaveAttribute("href", "/vzg/105-01");
  await page
    .locator("a.bf-station")
    .filter({ hasText: /^\s*Semmering\s*$/ })
    .click();
  // the station name opens its departure board (which links to Wikidata)
  await expect(page).toHaveURL(/\/station\/8100028/);
  await expect(page.getByRole("link", { name: /Wikidata/ })).toHaveAttribute(
    "href",
    "https://dinodata.toolforge.org/#P954=8100028",
  );
});

test("VzG index filters by line number and station, opens a line", async ({ page }) => {
  await page.goto("/vzg");
  // tooltip (popover, not a title attribute) on hover, also exposed as accessible description
  const full = "Verzeichnis der örtlich zulässigen Geschwindigkeiten und Besonderheiten";
  await expect(page.locator("h1 abbr")).toHaveAttribute("aria-description", full);
  if (!test.info().project.name.includes("mobile")) {
    await page.locator("h1 abbr").hover();
    await expect(page.getByRole("tooltip")).toHaveText(full);
  }
  await page.getByRole("searchbox").fill("10101");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("searchbox").fill("Maria Anzbach");
  await expect(page.locator("tbody tr").first()).toContainText("101 01");
  await page.getByRole("searchbox").press("Enter");
  await expect(page).toHaveURL(/\/vzg\/101-01/);
  const svg = page.locator("svg.vzg");
  await expect(svg.locator("text", { hasText: "Maria Anzbach" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Wikidata" })).toHaveAttribute(
    "href",
    /^https:\/\/dinodata\.toolforge\.org\/#Q\d+$/,
  );
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
  await page.locator("svg[role=img] path").first().waitFor(); // mounted (and remembered)
  await page.goto("/bf");
  await page.locator("tbody tr td:nth-child(2) a").nth(3).click();
  await expect(page).toHaveURL(/\/bf\/[^?]+\?/);
  await expect(page).toHaveURL(/d=2026-03-10/);
  await expect(page).toHaveURL(/from=7/);
  await expect(page).toHaveURL(/h=2/);
});

test("bildfahrplan: arrow keys zap through days and hours", async ({ page }) => {
  await page.goto("/bf/westbahn?from=7&h=2&d=2026-03-10");
  await page.locator("svg[role=img] path").first().waitFor();
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/d=2026-03-11/);
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expect(page).toHaveURL(/d=2026-03-09/);
  await page.keyboard.press("ArrowDown");
  await expect(page).toHaveURL(/from=8/);
  await page.keyboard.press("Shift+ArrowDown");
  await expect(page).toHaveURL(/from=10/);
  await page.keyboard.press("ArrowUp");
  await expect(page).toHaveURL(/from=9/);
  await page.keyboard.press("h");
  await expect(page).toHaveURL(/from=8/);
});

test("journeys: placeholder rows while loading later connections, new rows appended", async ({
  page,
}) => {
  await page.goto("/j/8103000/8100002");
  await expect(page.getByRole("button", { name: /Later|Später|Più tardi/ })).toBeEnabled();
  // slow down the next API answer to see the loading state
  await page.route("**/api/mgate", async (route) => {
    await new Promise((r) => setTimeout(r, 800));
    await route.fallback();
  });
  await page.getByRole("button", { name: /Later|Später|Più tardi/ }).click();
  await expect(page.locator(".skeleton").first()).toBeVisible();
  await expect(page.locator(".card[aria-busy=true]")).toBeVisible();
  await expect(page.locator(".skeleton")).toHaveCount(0);
});

test("shortcuts ignore Ctrl/⌘ combinations of the same letter (Ctrl+R reloads, no radar)", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("h1").waitFor();
  await page.locator("body").click({ position: { x: 5, y: 5 } }); // focus outside the search field
  await page.keyboard.press("Control+r");
  await page.keyboard.press("Meta+t");
  await page.waitForTimeout(300);
  await expect(page).toHaveURL(/\/$/);
  await page.keyboard.press("r");
  await expect(page).toHaveURL(/\/radar$/);
});

test("VzG chart exports a standalone SVG with caption and data sources", async ({ page }) => {
  await page.goto("/vzg/101-01?t=2");
  await page.locator("svg.vzg").waitFor();
  const [dl] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /SVG/ }).click(),
  ]);
  expect(dl.suggestedFilename()).toMatch(/^zugx_VzG_101_01_Westbahn_.+_2\.svg$/);
  const svg = await new Promise<string>((resolve) => {
    void dl.createReadStream().then((s) => {
      let t = "";
      s.on("data", (c: Buffer) => (t += c.toString()));
      s.on("end", () => resolve(t));
    });
  });
  expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
  expect(svg).toMatch(/<title>.*101 01 Westbahn/);
  expect(svg).toContain("OpenStreetMap");
  expect(svg).toContain("zugx");
  expect(svg).not.toContain("class=");
  expect(svg).not.toContain("var(--");
  expect(svg).toContain("font-family:Liberation Sans, Arial");
});

test("VzG chart links connecting lines at junction stations", async ({ page }) => {
  await page.goto("/vzg/101-03");
  await page.locator("svg.vzg").waitFor();
  const list = page.locator("section section", {
    has: page.getByRole("heading", { name: /Connecting|Anschluss|coincidenza/ }),
  });
  await expect(list).toContainText("Schwarzach");
  await list.getByRole("link", { name: /^222 01/ }).click();
  await expect(page).toHaveURL(/\/vzg\/222-01\?km=/);
  await expect(page.locator("svg.vzg")).toBeVisible();
});

test("help page explains the views and data sources", async ({ page }) => {
  if (test.info().project.name.includes("mobile")) {
    await page.goto("/hilfe"); // nav behind the menu button on phones; German alias redirects
  } else {
    await page.goto("/");
    await page
      .getByRole("navigation")
      .getByRole("link", { name: /^(Help|Hilfe|Aiuto)$/ })
      .click();
  }
  await expect(page).toHaveURL(/\/help$/);
  await expect(page.locator("h1")).toHaveText(/Help|Hilfe/);
  await expect(page.locator("#bildfahrplan")).toBeVisible();
  await expect(page.getByText(/OpenStreetMap/).first()).toBeVisible();
});

test("VzG line map: drawn from the line's geometry, exportable as SVG", async ({ page }) => {
  await page.goto("/vzg/101-03");
  await page.getByRole("link", { name: /^(Map|Karte|Mappa)$/ }).click();
  await expect(page).toHaveURL(/\/vzg\/101-03\/map$/);
  const svg = page.locator(".map-card svg");
  await expect(svg.locator("text", { hasText: "Salzburg-Tiroler-Bahn" }).first()).toBeVisible();
  await expect(svg.locator("text", { hasText: "Wörgl" }).first()).toBeVisible();
  await expect(svg.locator("text", { hasText: "OpenStreetMap" })).toBeVisible();
  const [dl] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /SVG/ }).click(),
  ]);
  expect(dl.suggestedFilename()).toMatch(/^zugx_.*101_03.*\.svg$/);
  const file = await new Promise<string>((resolve) => {
    void dl.createReadStream().then((st) => {
      let t = "";
      st.on("data", (c: Buffer) => (t += c.toString()));
      st.on("end", () => resolve(t));
    });
  });
  expect(file).not.toContain("href=");
  // colour by permitted speed (ColorBrewer RdYlBu scale + legend)
  await page.getByRole("button", { name: /By speed|Nach Geschwindigkeit|Per velocità/ }).click();
  await expect(page).toHaveURL(/farbe=v/);
  await expect(svg.locator("text", { hasText: "> 200" })).toBeVisible();
  await expect(
    svg.locator("path[stroke='#d73027'], path[stroke='#4575b4']").first(),
  ).toBeAttached();
  // links: connecting line → its map, station → departure board
  await svg.locator("a", { hasText: "222 01" }).first().click();
  await expect(page).toHaveURL(/\/vzg\/222-01\/map$/);
  await page.locator(".map-card svg a", { hasText: "Schwarzach" }).first().click();
  await expect(page).toHaveURL(/\/station\/\d+/);
});

/** download a view's SVG and compare it with e2e/tests/snapshots/<file> (UPDATE_SNAPSHOTS=1 writes) */
async function svgSnapshot(page: import("@playwright/test").Page, url: string, file: string) {
  await page.goto(url);
  await page.locator(".map-card svg, svg.vzg, svg.vzg-band").first().waitFor();
  await page.waitForTimeout(300); // station links (station index) are resolved asynchronously
  const [dl] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /SVG/ }).click(),
  ]);
  const svg = await new Promise<string>((resolve) => {
    void dl.createReadStream().then((st) => {
      let t = "";
      st.on("data", (c: Buffer) => (t += c.toString()));
      st.on("end", () => resolve(t));
    });
  });
  // the link back depends on the test server's address
  const normalized = svg.replace(/https?:\/\/[^/\s<]+\/vzg\//g, "https://zugx.legner.me/vzg/");
  const path = new URL(`snapshots/${file}`, import.meta.url);
  if (process.env.UPDATE_SNAPSHOTS) {
    mkdirSync(new URL("snapshots/", import.meta.url), { recursive: true });
    writeFileSync(path, normalized);
  }
  expect(normalized).toBe(readFileSync(path, "utf8"));
}

test.describe("SVG snapshots of the Kamptalbahn (174 01)", () => {
  test.skip(({ isMobile }) => isMobile, "same SVG in every project");
  test("VzG chart", ({ page }) => svgSnapshot(page, "/vzg/174-01", "174-01-vzg.svg"));
  test("Streckenband", ({ page }) =>
    svgSnapshot(page, "/vzg/174-01?ansicht=band", "174-01-streckenband.svg"));
  test("line map", ({ page }) => svgSnapshot(page, "/vzg/174-01/map", "174-01-map.svg"));
});

test("network map: all lines, colour by attribute, line links", async ({ page }) => {
  await page.goto("/vzg");
  await page.getByRole("link", { name: /Network map|Netzkarte|Mappa della rete/ }).click();
  await expect(page).toHaveURL(/\/vzg\/netz$/);
  const svg = page.locator(".map-card svg");
  await expect(svg.locator("a.net-line").first()).toBeAttached();
  expect(await svg.locator("a.net-line").count()).toBeGreaterThan(150);
  await page.getByRole("button", { name: /^(Operator|Betreiber|Gestore)$/ }).click();
  await expect(page).toHaveURL(/attr=operator/);
  await expect(svg.locator("text", { hasText: "ÖBB-Infrastruktur AG" })).toBeVisible();
});
