import { describe, expect, it } from "vite-plus/test";
import { fromToml } from "@zugx/toml";
import {
  buildCorridor,
  corridorToml,
  corridorRuns,
  corridorStations,
  encodeDays,
} from "../src/corridors.ts";
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
