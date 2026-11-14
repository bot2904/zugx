import { describe, expect, it } from "vite-plus/test";
import { fromToml } from "@zugx/toml";
import {
  buildCorridor,
  corridorToml,
  corridorRuns,
  corridorStations,
  encodeDays,
  shapeOnLine,
} from "../src/corridors.ts";
import { shapeDistanceKm, type Shape } from "../src/gtfs.ts";
import { feed, lineStations, trip } from "./helpers.ts";

// A —10— a1 —10— B —20— C, plus a parallel line B — x1 — C (longer) and a branch y1
const stations = lineStations(["A", "a1", "B", "C", "x1", "y1"], [10, 10, 20, 5, 5]);

const local = (nr: string, t0: number) =>
  trip("R", nr, [
    ["A", t0, t0, 0],
    ["a1", t0 + 8, t0 + 9, 10],
    ["B", t0 + 17, t0 + 18, 20],
    ["C", t0 + 35, t0 + 35, 40],
  ]);
const express = (nr: string, t0: number) =>
  trip("RJX", nr, [
    ["C", t0, t0, 0],
    ["A", t0 + 25, t0 + 25, 40],
  ]);
// detour line B → x1 → C, 30 km instead of 20
const detour = trip("R", "900", [
  ["B", 600, 600, 0],
  ["x1", 615, 616, 12],
  ["C", 640, 640, 30],
]);
const branch = trip("S", "77", [
  ["y1", 500, 500, 0],
  ["B", 510, 511, 6],
  ["a1", 520, 520, 16],
]);

const def = { id: "test", name: "Test", anchors: ["A", "B", "C"] };

describe("corridorStations", () => {
  const f = feed(stations, [local("1", 360), local("3", 420), express("2", 400), detour, branch]);
  const st = corridorStations(f, def);

  it("orders stations by km and uses track distances", () => {
    expect(st.map((s) => s.id)).toEqual(["A", "a1", "B", "C"]);
    expect(st.map((s) => s.km)).toEqual([0, 10, 20, 40]);
    expect(st.filter((s) => s.major).map((s) => s.id)).toEqual(["A", "B", "C"]);
  });

  it("skips stations of a parallel (longer) line", () => {
    expect(st.some((s) => s.id === "x1")).toBe(false);
  });

  it("drops intermediate stations of nonstop segments", () => {
    const st2 = corridorStations(f, { ...def, nonstop: ["A"] });
    expect(st2.map((s) => s.id)).toEqual(["A", "B", "C"]);
  });
});

describe("corridorRuns", () => {
  const idx = new Map(["A", "a1", "B", "C"].map((s, i) => [s, i]));

  it("extracts both directions with arr/dep minutes", () => {
    expect(corridorRuns(local("1", 360), idx)).toEqual([
      {
        cat: "R",
        nr: "1",
        dir: 1,
        headsign: "C",
        pts: [
          [0, null, 360],
          [1, 368, 369],
          [2, 377, 378],
          [3, 395, null],
        ],
      },
    ]);
    const [r] = corridorRuns(express("2", 400), idx);
    expect(r!.dir).toBe(-1);
    expect(r!.pts).toEqual([
      [3, null, 400],
      [0, 425, null],
    ]);
  });

  it("splits a run where the train leaves the corridor", () => {
    const runs = corridorRuns(detour, idx);
    // B → x1 (off corridor) → C: two single points, nothing left
    expect(runs).toEqual([]);
    const branchRuns = corridorRuns(branch, idx);
    expect(branchRuns).toHaveLength(1);
    expect(branchRuns[0]!.pts).toEqual([
      [2, null, 511],
      [1, 520, null],
    ]);
  });

  it("ignores trains touching only one station", () => {
    const t = trip("R", "5", [
      ["C", 100, 100, 0],
      ["x1", 110, 110, 5],
    ]);
    expect(corridorRuns(t, idx)).toEqual([]);
  });
});

describe("buildCorridor", () => {
  it("collects and sorts all trains and serialises one train per line", () => {
    const f = feed(stations, [local("3", 420), local("1", 360), express("2", 400), branch]);
    const c = buildCorridor(f, def, "2026-03-10", "test");
    // sorted by first departure: 360, 400, 420, 511
    expect(c.trains.map((t) => t.nr)).toEqual(["1", "2", "3", "77"]);
    const toml = corridorToml(c);
    expect(fromToml(toml)).toEqual(c);
    expect(toml.split("\n").filter((l) => l.startsWith("  { cat = "))).toHaveLength(4);
  });
});

describe("encodeDays", () => {
  it("sets bits MSB first", () => {
    expect(encodeDays([0], 8)).toBe(Buffer.from([0x80]).toString("base64"));
    expect(encodeDays([7, 8], 16)).toBe(Buffer.from([0x01, 0x80]).toString("base64"));
  });
});

describe("corridorStations: local trains between anchors", () => {
  // A —10— a1 —5— l1 —5— B —15— b1 —15— C ; anchors A, B, C
  const st0 = lineStations(["A", "a1", "l1", "B", "b1", "C"], [10, 5, 5, 15, 15]);
  const through = trip("R", "1", [
    ["A", 0, 0, 0],
    ["a1", 8, 9, 10],
    ["B", 17, 18, 20],
    ["C", 40, 40, 50],
  ]);
  // starts at a1 (not an anchor): the only train serving l1
  const shortLocal = trip("R", "2", [
    ["a1", 100, 100, 0],
    ["l1", 105, 106, 5],
    ["B", 110, 110, 10],
  ]);
  // local B → b1 → C
  const localBC = trip("S", "3", [
    ["B", 200, 200, 0],
    ["b1", 210, 211, 15],
    ["C", 220, 220, 30],
  ]);
  const st = corridorStations(feed(st0, [through, shortLocal, localBC]), {
    id: "t",
    name: "T",
    anchors: ["A", "B", "C"],
  });

  it("adds stops of trains starting between anchors in small gaps (Semmering: Küb …)", () => {
    expect(st.map((s) => s.id)).toEqual(["A", "a1", "l1", "B", "b1", "C"]);
    expect(st.find((s) => s.id === "l1")!.km).toBe(15);
  });

  it("keeps long gaps of through trains (long-distance sheets show only their stops)", () => {
    // sheet A – C: through trains stop at a1 and B; the 30 km gap B → C is not filled with b1
    const sheet = corridorStations(feed(st0, [through, shortLocal, localBC]), {
      id: "ld",
      name: "LD",
      anchors: ["A", "C"],
    });
    expect(sheet.map((s) => s.id)).toEqual(["A", "a1", "l1", "B", "C"]);
  });
});

describe("trains on a parallel line (GTFS shapes)", () => {
  // stations along lat 47, lon 13 … ; shape: a straight line at lat 47 (on the line), or a
  // detour 0.1° (≈ 11 km) north between the 2nd and 3rd point (parallel line)
  const st0 = lineStations(["A", "m1", "m2", "B"], [10, 10, 10]);
  const shape = (northKm: number): Shape => {
    const lon = [13, 13 + 10 / 75.8, 13 + 20 / 75.8, 13 + 30 / 75.8];
    const lat = [47, 47 + northKm / 111, 47 + northKm / 111, 47];
    return {
      lat: Float32Array.from(lat),
      lon: Float32Array.from(lon),
      dist: Float32Array.from([0, 10000, 20000, 30000]),
    };
  };
  const express = (shapeId: string) => ({
    ...trip("RJ", "1", [
      ["A", 0, 0, 0],
      ["B", 15, 15, 30],
    ]),
    shape: shapeId,
  });
  const def = { id: "t", name: "T", anchors: ["A", "B"] };
  const local = trip("R", "2", [
    ["A", 0, 0, 0],
    ["m1", 8, 8, 10],
    ["m2", 16, 16, 20],
    ["B", 24, 24, 30],
  ]);
  const f = feed(st0, [local]);
  const stations = corridorStations(f, def);
  const idx = new Map(stations.map((s, i) => [s.id, i]));
  const shapes = new Map([
    ["on", shape(0)],
    ["bypass", shape(1.5)],
    ["parallel", shape(11)],
  ]);
  const onLine = shapeOnLine(f, stations, shapes);

  it("measures the distance to the part of the shape between two stops", () => {
    expect(shapeDistanceKm(shapes.get("parallel")!, 47, 13 + 15 / 75.8)).toBeCloseTo(11, 0);
    expect(shapeDistanceKm(shapes.get("on")!, 47, 13 + 15 / 75.8)).toBeLessThan(0.01);
  });

  it("draws trains skipping stations only if they run along the line (bypasses ≤ 3 km)", () => {
    expect(corridorRuns(express("on"), idx, onLine)).toHaveLength(1);
    expect(corridorRuns(express("bypass"), idx, onLine)).toHaveLength(1);
    // parallel line: A and B are not connected on this sheet (single points are no run)
    expect(corridorRuns(express("parallel"), idx, onLine)).toEqual([]);
    // without shape: drawn as before
    expect(corridorRuns({ ...express("x"), shape: undefined }, idx, onLine)).toHaveLength(1);
  });
});
