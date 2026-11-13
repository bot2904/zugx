import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@zugx/hafas";
import { describe, expect, it } from "vite-plus/test";
import { buildIcs, icsEscape, icsFold, icsSummary } from "./ical.ts";

const fixture = JSON.parse(
  readFileSync(
    join(import.meta.dirname, "../../../../packages/hafas/fixtures/trip-search.json"),
    "utf8",
  ),
).response;
const client = createClient({
  fetch: (async () => new Response(JSON.stringify(fixture))) as typeof fetch,
});
const labels = {
  platform: "Pl.",
  transfer: (m: number) => `Transfer ${m} min`,
  walk: (m: number) => `Walk ${m} min`,
  duration: "Duration",
  transfers: "Chg",
  realtime: "realtime",
  open: "Open in zugx",
};

describe("ical", () => {
  it("escapes and folds", () => {
    expect(icsEscape("a,b;c\nd\\e")).toBe(String.raw`a\,b\;c\nd\\e`);
    const folded = icsFold(`DESCRIPTION:${"ö".repeat(100)}`);
    for (const l of folded.split("\r\n"))
      expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    expect(folded.split("\r\n ").join("")).toBe(`DESCRIPTION:${"ö".repeat(100)}`);
  });

  it("builds a valid event with summary, body and deep link", async () => {
    const j = (await client.journeys("8103000", "8100173")).journeys[1]!;
    const ics = buildIcs(
      j,
      "https://zugx.legner.me/trip/abc",
      labels,
      new Date("2026-11-13T12:00:00Z"),
    );
    const unfolded = ics.replace(/\r\n /g, "");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(unfolded).toMatch(/^DTSTART:\d{8}T\d{6}Z$/m);
    expect(unfolded).toMatch(/^SUMMARY:Wien Hbf → Graz Hbf · \S/m);
    expect(unfolded).toContain("URL:https://zugx.legner.me/trip/abc");
    expect(unfolded).toContain("Open in zugx: https://zugx.legner.me/trip/abc");
    expect(unfolded).toContain("TRIGGER:-PT15M");
    expect(icsSummary(j).length).toBeLessThan(80);
  });
});
