import { describe, expect, it } from "vite-plus/test";
import {
  decodeDays,
  dayIndexes,
  encodeDays,
  isLongDistance,
  LONG_DISTANCE_CATEGORIES,
  parseTrainName,
  runsOn,
} from "../src/index.ts";
import { chainTrips, compareTrains, operatorSlug, stopRef } from "../src/build.ts";

describe("running days bitset", () => {
  const begin = "2025-12-14";

  it("round-trips day indexes", () => {
    const days = [0, 1, 7, 8, 100, 363];
    const b64 = encodeDays(days, 364);
    expect(b64).toHaveLength(64); // 46 bytes
    expect(dayIndexes(b64)).toEqual(days);
  });

  it("is MSB first", () => {
    expect(encodeDays([0], 8)).toBe(btoa("\x80"));
    expect(encodeDays([7], 8)).toBe(btoa("\x01"));
  });

  it("decodes to ISO dates", () => {
    const b64 = encodeDays([0, 18, 363], 364);
    expect([...decodeDays(b64, begin)]).toEqual(["2025-12-14", "2026-01-01", "2026-12-12"]);
  });

  it("answers runsOn", () => {
    const e = { days: encodeDays([0, 18], 364) };
    expect(runsOn(e, "2025-12-14", begin)).toBe(true);
    expect(runsOn(e, "2025-12-15", begin)).toBe(false);
    expect(runsOn(e, "2026-01-01", begin)).toBe(true);
    expect(runsOn(e, "2025-12-13", begin)).toBe(false);
    expect(runsOn(e, "2027-01-01", begin)).toBe(false);
  });
});

describe("categories", () => {
  it("parses train names", () => {
    expect(parseTrainName("RJX 260")).toEqual({ cat: "RJX", nr: "260" });
    expect(parseTrainName("S 2590")).toEqual({ cat: "S", nr: "2590" });
    expect(parseTrainName("SV133")).toEqual({ cat: "SV", nr: "133" });
    expect(parseTrainName("")).toBeUndefined();
    expect(parseTrainName("Bus")).toBeUndefined();
  });

  it("knows long-distance categories", () => {
    expect(LONG_DISTANCE_CATEGORIES).toContain("RJX");
    expect(isLongDistance({ cat: "NJ" })).toBe(true);
    for (const c of ["R", "REX", "CJX", "S"]) expect(isLongDistance({ cat: c })).toBe(false);
  });
});

describe("build helpers", () => {
  it("chains GTFS trip segments", () => {
    const a = [
      { g: "Wien", arr: 100, dep: 100 },
      { g: "Salzburg", arr: 200, dep: 210 },
      { g: "Freilassing", arr: 220, dep: 220 },
    ];
    const b = [
      { g: "Freilassing", arr: 225, dep: 225 },
      { g: "München", arr: 300, dep: 300 },
    ];
    expect(chainTrips([b, a]).map((s) => [s.g, s.arr, s.dep])).toEqual([
      ["Wien", 100, 100],
      ["Salzburg", 200, 210],
      ["Freilassing", 220, 225],
      ["München", 300, 300],
    ]);
  });

  it("formats stop times", () => {
    expect(stopRef("1", 6 * 3600 + 28 * 60)).toEqual(["1", "06:28"]);
    expect(stopRef("1", 32 * 3600 + 56 * 60)).toEqual(["1", "08:56", 1]);
  });

  it("slugs operators", () => {
    expect(operatorSlug("OEBB Personenverkehr AG Kundenservice")).toBe("oebb");
    expect(operatorSlug("Montafonerbahn AG")).toBe("montafonerbahn");
    expect(operatorSlug("City Air Terminal Betriebsgesellschaft m.b.H.")).toBe("cat");
  });

  it("sorts by category, then number", () => {
    const t = (cat: string, nr: string) => ({ op: "oebb", cat, nr }) as never;
    const list = [t("RJX", "60"), t("EC", "163"), t("RJX", "260"), t("EC", "17")];
    expect(
      list.sort(compareTrains).map((x: { cat: string; nr: string }) => `${x.cat} ${x.nr}`),
    ).toEqual(["EC 17", "EC 163", "RJX 60", "RJX 260"]);
  });
});
