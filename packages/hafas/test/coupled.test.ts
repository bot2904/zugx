import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import {
  compareParts,
  groupMovements,
  operationalChanges,
  partSections,
  type Line,
  type Movement,
} from "../src/index.ts";
import { parseJourneyDetails } from "../src/parse.ts";

const line = (name: string, product: Line["product"] = "highspeed"): Line => {
  const [category = "", number = ""] = name.split(" ");
  return { name, category, number, cls: 1, product };
};
const mv = (name: string, lat: number, stop: string, time: string, product?: Line["product"]) =>
  ({
    journeyId: `jid ${name}`,
    line: line(name, product),
    direction: "",
    lat,
    lon: 13,
    nextStops: [{ stop: { id: stop, name: stop, type: "station" }, arr: { planned: time } }],
  }) as Movement;

describe("coupled train parts", () => {
  it("orders the likely operational train first", () => {
    const names = ["EN 40462", "NJ 466", "EN 50462"].map((n) => line(n));
    expect(names.sort(compareParts).map((l) => l.name)).toEqual(["NJ 466", "EN 40462", "EN 50462"]);
    expect([line("RJX 19981"), line("RJX 61")].sort(compareParts)[0]!.name).toBe("RJX 61");
  });
  it("merges radar movements at the same position sharing a stop time", () => {
    const g = groupMovements([
      mv("EN 40462", 47.1, "Bludenz", "T1"),
      mv("NJ 466", 47.1, "Bludenz", "T1"),
      mv("NJ 466", 47.1, "Bludenz", "T1"), // duplicate entry
      mv("RJX 61", 47.1, "Linz", "T2"), // same position, different train
      mv("Bus S2", 48, "X", "T3", "bus"),
      mv("Bus S2", 48, "X", "T3", "bus"),
    ]);
    expect(g.map((p) => p.map((m) => m.line.name).join(" / "))).toEqual([
      "Bus S2",
      "Bus S2",
      "NJ 466 / EN 40462",
      "RJX 61",
    ]);
  });
});

describe("joined trains from JourneyDetails (parJnySegL)", () => {
  const trip = (f: string) =>
    parseJourneyDetails(
      JSON.parse(readFileSync(join(import.meta.dirname, "..", "fixtures", `${f}.json`), "utf8"))
        .response.svcResL[0].res,
    );
  const sec = (t: ReturnType<typeof trip>) =>
    partSections(t).map(
      (s) =>
        `${t.stopovers[s.from]!.stop.name} – ${t.stopovers[s.to]!.stop.name}: ${s.with
          .map((p) => p.line.name)
          .join(
            ", ",
          )}${s.operational ? ` → ${s.operational.line.name}${s.operational.hint ? "?" : ""}` : ""}`,
    );
  it("EN 40462: EC 462 to Salzburg, then NJ 466", () => {
    const t = trip("journey-details-coupled-40462");
    expect(t.parts?.map((p) => p.line.name)).toEqual(["EC 462", "NJ 466", "EN 50462"]);
    expect(sec(t)).toEqual([
      "Budapest-Keleti – Salzburg Hbf: EC 462, EN 50462 → EC 462",
      "Salzburg Hbf – Zürich HB: NJ 466 → NJ 466",
    ]);
    const ch = operationalChanges(partSections(t));
    expect([...ch].map(([i, o]) => `${t.stopovers[i]!.stop.name}: ${o?.line.name}`)).toEqual([
      "Salzburg Hbf: NJ 466",
    ]);
  });
  it("EN 40237: the operational EN 415 from HAFAS' matchId", () => {
    const t = trip("journey-details-coupled-40237");
    expect(sec(t).join("\n")).toMatch(/EN 415\?/);
  });
});
