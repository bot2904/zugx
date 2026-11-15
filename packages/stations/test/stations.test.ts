import { readFileSync } from "node:fs";
import { fromToml } from "@zugx/toml";
import { join } from "node:path";
import { validate, type Schema } from "@zugx/gtfs";
import { describe, expect, it } from "vite-plus/test";
import type { Station } from "../src/index.ts";
import {
  cleanGtfsName,
  cleanHafasName,
  nameSimilarity,
  normalizeName,
  scoreCandidates,
  withDiacritics,
} from "../src/match.ts";

const root = join(import.meta.dirname, "..");
const text = readFileSync(join(root, "data", "stations.toml"), "utf8");
const { stations } = fromToml<{ stations: Station[] }>(text);
const schema = JSON.parse(readFileSync(join(root, "stations.schema.json"), "utf8")) as Schema;

describe("data/stations.toml", () => {
  it("matches stations.schema.json", () => {
    expect(validate(schema, stations)).toEqual([]);
  });

  it("has one station per line", () => {
    const lines = text.trimEnd().split("\n");
    expect(lines[0]).toBe("stations = [");
    expect(lines.at(-1)).toBe("]");
    expect(lines.length).toBe(stations.length + 2);
  });

  it("is sorted by id, ids unique", () => {
    const ids = stations.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(ids);
  });

  it("has a sane number of stations", () => {
    expect(stations.length).toBeGreaterThan(800);
    expect(stations.length).toBeLessThan(3000);
  });

  it.each([
    ["8103000", "Wien Hbf"],
    ["8100013", "Linz/Donau Hbf"],
    ["8100002", "Salzburg Hbf"],
    ["8100173", "Graz Hbf"],
    ["8100108", "Innsbruck Hbf"],
  ])("contains %s %s", (id, name) => {
    const s = stations.find((x) => x.id === id);
    expect(s?.name).toBe(name);
    expect(s?.p).toContain("RJX");
    expect(s?.w).toBeGreaterThan(700);
  });

  it("ranks Wien Hbf above Wiener Neustadt", () => {
    const w = (id: string) => stations.find((s) => s.id === id)?.w ?? 0;
    expect(w("8103000")).toBeGreaterThan(w("8100516"));
  });
});

describe("matching helpers", () => {
  it("normalizes names", () => {
    expect(normalizeName("St. Pölten Hauptbahnhof")).toBe(normalizeName("St.Pölten Hbf"));
    expect(normalizeName("Sankt Valentin Bahnhof")).toBe("st valentin");
    expect(normalizeName("Wr.Neustadt Hbf", true)).toBe(normalizeName("Wiener Neustadt Hbf"));
  });

  it("compares names", () => {
    expect(nameSimilarity("Linz/Donau Hauptbahnhof", "Linz/Donau Hbf")).toBe(1);
    expect(nameSimilarity("Traisen Markt Bahnhof", "Traisen NÖ Markt Bahnhst")).toBeGreaterThan(
      0.7,
    );
    expect(nameSimilarity("Selzthal", "Wien Hbf")).toBe(0);
  });

  it("cleans names", () => {
    expect(cleanHafasName("Wien Hbf (Bahnsteige 3-12)")).toBe("Wien Hbf");
    expect(cleanHafasName("Wien Hbf (Autoreisezug)")).toBe("Wien Hbf (Autoreisezug)");
    expect(cleanGtfsName("Bad Sauerbrunn Bahnhof")).toBe("Bad Sauerbrunn");
  });

  it("prefers the close UIC rail station", () => {
    const gtfs = { id: "Pat:49:1349", name: "Wien Hauptbahnhof", lat: 48.18501, lon: 16.3785 };
    const best = scoreCandidates(gtfs, [
      {
        id: "904056",
        name: "Wien Gertrude-Fröhlich-Sandner-Straße",
        type: "station",
        lat: 48.1859,
        lon: 16.3779,
        products: 64,
      },
      {
        id: "1290401",
        name: "Wien Hbf (U)",
        type: "station",
        lat: 48.184986,
        lon: 16.37795,
        products: 6015,
      },
      {
        id: "8101590",
        name: "Wien Hbf (Bahnsteige 1-2)",
        type: "station",
        lat: 48.185993,
        lon: 16.375119,
        products: 48,
      },
      {
        id: "8103000",
        name: "Wien Hbf (Bahnsteige 3-12)",
        type: "station",
        lat: 48.184986,
        lon: 16.37795,
        products: 4157,
      },
    ])[0];
    expect(best?.loc.id).toBe("8103000");
  });
});

describe("withDiacritics", () => {
  it("restores the diacritics of a foreign HAFAS name from the GTFS name", () => {
    expect(withDiacritics("Divaca", ["Divača"])).toBe("Divača");
    expect(withDiacritics("Sezana", ["Sežana Bahnhof"])).toBe("Sežana");
  });
  it("keeps HAFAS names that differ otherwise or already have diacritics", () => {
    expect(withDiacritics("Jesenice(SLO)", ["Jesenice"])).toBe("Jesenice(SLO)");
    expect(withDiacritics("Wien Hbf", ["Wien Hauptbahnhof"])).toBe("Wien Hbf");
    expect(withDiacritics("Völs", ["Vols"])).toBe("Völs");
  });
});
