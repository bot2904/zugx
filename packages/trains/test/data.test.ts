import { readdirSync, readFileSync } from "node:fs";
import { fromToml } from "@zugx/toml";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { compareTrains } from "../src/build.ts";
import { dayIndexes, isLongDistance, type TrainEntry, type TrainIndex } from "../src/index.ts";

const dataDir = join(import.meta.dirname, "..", "data");
const years = readdirSync(dataDir)
  .map((f) => /^trains-(\d{4})\.toml$/.exec(f)?.[1])
  .filter((y): y is string => !!y);

const load = (file: string) => {
  const text = readFileSync(join(dataDir, file), "utf8");
  return { text, idx: fromToml<TrainIndex>(text) };
};

const KEYS = [
  "op",
  "cat",
  "nr",
  "name",
  "from",
  "to",
  "via",
  "stops",
  "days",
  "n",
  "first",
  "last",
  "var",
];
const key = (e: TrainEntry) => `${e.op} ${e.cat} ${e.nr}`;

it("has data files", () => {
  expect(years).toContain("2026");
});

describe.each(years)("trains-%s", (year) => {
  const def = load(`trains-${year}.toml`);
  const full = load(`trains-${year}.full.toml`);

  describe.each([
    ["default", def],
    ["full", full],
  ])("%s file", (_label, { text, idx }) => {
    const days = Temporal.PlainDate.from(idx.begin).until(idx.end).days + 1;

    it("has the header fields", () => {
      expect(idx.year).toBe(Number(year));
      expect(idx.begin).toMatch(/^\d{4}-12-\d\d$/);
      expect(idx.end).toMatch(new RegExp(`^${year}-12-\\d\\d$`));
      expect(idx.source).toBeTruthy();
    });

    it("has one train per line", () => {
      const lines = text.trimEnd().split("\n");
      const trainLines = lines.filter((l) => l.startsWith("  { op = "));
      expect(trainLines.length).toBe(idx.trains.length);
    });

    it("is sorted by category then number, keys unique", () => {
      expect([...idx.trains].sort(compareTrains)).toEqual(idx.trains);
      expect(new Set(idx.trains.map(key)).size).toBe(idx.trains.length);
    });

    it("has well-formed entries", () => {
      const bytes = Math.ceil(days / 8);
      for (const e of idx.trains) {
        const where = key(e);
        expect(
          Object.keys(e).every((k) => KEYS.includes(k)),
          where,
        ).toBe(true);
        expect(e.cat, where).toMatch(/^[A-ZÄÖÜ]{1,5}$/);
        expect(e.nr, where).toMatch(/^\d+[A-Za-z]?$/);
        for (const s of [e.from, e.to]) {
          expect(s[1], where).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
          expect(idx.stations[s[0]], where).toBeTruthy();
        }
        for (const v of e.via) expect(idx.stations[v], where).toBeTruthy();
        expect(e.via.length, where).toBeLessThanOrEqual(6);
        for (const v of e.stops) expect(idx.stations[v], where).toBeTruthy();
        for (const v of e.via) expect(e.stops, where).toContain(v);
        // bitset length matches the timetable year
        expect(atob(e.days).length, where).toBe(bytes);
        const d = dayIndexes(e.days);
        expect(d.length, where).toBe(e.n);
        expect(d.at(-1)!, where).toBeLessThan(days);
        const iso = (i: number) => Temporal.PlainDate.from(idx.begin).add({ days: i }).toString();
        expect(e.first, where).toBe(iso(d[0]!));
        expect(e.last, where).toBe(iso(d.at(-1)!));
        if (e.var !== undefined) expect(e.var, where).toBeGreaterThan(1);
      }
    });

    it("lists only referenced stations", () => {
      const used = new Set(idx.trains.flatMap((e) => [e.from[0], e.to[0], ...e.stops]));
      expect(Object.keys(idx.stations).sort()).toEqual([...used].sort());
    });
  });

  it("default is a strict subset of full", () => {
    const fullByKey = new Map(full.idx.trains.map((e) => [key(e), e]));
    for (const e of def.idx.trains) expect(fullByKey.get(key(e)), key(e)).toEqual(e);
    expect(def.idx.trains.length).toBeLessThan(full.idx.trains.length);
    expect(def.idx.trains.every(isLongDistance)).toBe(true);
    expect(full.idx.trains.filter(isLongDistance)).toEqual(def.idx.trains);
    for (const [id, name] of Object.entries(def.idx.stations))
      expect(full.idx.stations[id]).toBe(name);
    const { trains: _a, stations: _b, ...defHead } = def.idx;
    const { trains: _c, stations: _d, ...fullHead } = full.idx;
    expect(defHead).toEqual(fullHead);
  });

  it("contains well-known trains", () => {
    const has = (cat: string) => def.idx.trains.some((e) => e.cat === cat);
    for (const c of ["RJX", "RJ", "NJ", "EC"]) expect(has(c)).toBe(true);
    expect(full.idx.trains.some((e) => e.cat === "S")).toBe(true);
  });
});
