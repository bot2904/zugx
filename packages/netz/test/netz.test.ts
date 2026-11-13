import { describe, expect, it } from "vite-plus/test";
import {
  buildNetz,
  compositeEdges,
  edgeKm,
  groupPatterns,
  insertPassThroughs,
  projectTrips,
} from "../src/netz.ts";
import { feed, lineStations, trip } from "./helpers.ts";

// X —30— Y —30— Z, intermediate station m between X and Y
const stations = lineStations(["X", "m", "Y", "Z"], [15, 15, 30]);
const nodes = [
  { id: "X", code: "X" },
  { id: "Y", code: "Y" },
  { id: "Z", code: "Z" },
];

/** hourly IC X → Y → Z at :10, and back Z → Y → X at :50 (symmetric around :00) */
function hourly() {
  const trips = [];
  for (let h = 6; h <= 20; h++) {
    const t = h * 60;
    trips.push(
      trip("IC", String(100 + 2 * h), [
        ["X", t + 10, t + 10, 0],
        ["m", t + 20, t + 21, 15],
        ["Y", t + 30, t + 32, 30],
        ["Z", t + 58, t + 58, 60],
      ]),
      trip("IC", String(101 + 2 * h), [
        ["Z", t + 2, t + 2, 0],
        ["Y", t + 28, t + 30, 30],
        ["X", t + 50, t + 50, 60],
      ]),
    );
  }
  return trips;
}

describe("pattern grouping", () => {
  it("merges short runs into the containing pattern", () => {
    const short = trip("IC", "999", [
      ["Y", 700, 702, 0],
      ["Z", 728, 728, 30],
    ]);
    const nt = projectTrips([...hourly(), short], new Set(["X", "Y", "Z"]));
    const groups = groupPatterns(nt);
    expect(groups).toHaveLength(2);
    const fwd = groups.find((g) => g.seq.join() === "X,Y,Z")!;
    expect(fwd.trips).toHaveLength(16);
    expect(fwd.trips.find((t) => t.nt.trip.nr === "999")!.offset).toBe(1);
  });
});

describe("pass-through detection", () => {
  it("inserts a nonstop pass at an intermediate node with interpolated time", () => {
    const express = trip("RJ", "1", [
      ["X", 600, 600, 0],
      ["Z", 640, 640, 60],
    ]);
    const nt = projectTrips([...hourly(), express], new Set(["X", "Y", "Z"]));
    const km = edgeKm(nt, stations);
    expect(km.get("X|Z")).toBe(60);
    const comp = compositeEdges(km);
    expect(comp.get("X>Z")).toEqual(["Y"]);
    insertPassThroughs(nt, comp, km);
    const e = nt.find((t) => t.trip.nr === "1")!;
    expect(e.pts.map((p) => [p.node, p.arr, p.dep, !!p.pass])).toEqual([
      ["X", 600, 600, false],
      ["Y", 620, 620, true],
      ["Z", 640, 640, false],
    ]);
  });
});

describe("buildNetz", () => {
  const model = buildNetz(feed(stations, hourly()), {
    day: "2026-03-10",
    source: "test",
    cats: ["IC"],
    nodes,
  });

  it("builds one paired hourly line", () => {
    expect(model.lines).toHaveLength(1);
    const l = model.lines[0]!;
    expect(l.takt).toBe(60);
    expect(l.name).toBe("X – Z");
    expect(l.fwd.trips).toBe(15);
    expect(l.fwd.first).toBe("06:10");
    expect(l.fwd.last).toBe("20:10");
    expect(l.fwd.numbers).toBe("IC 112–140");
    expect(l.fwd.stops).toEqual([
      { node: "X", arr: null, dep: 10 },
      { node: "Y", arr: 30, dep: 32 },
      { node: "Z", arr: 58, dep: null },
    ]);
    expect(l.fwd.travel).toEqual([20, 26]);
    expect(l.back!.stops.map((s) => s.node)).toEqual(["Z", "Y", "X"]);
    expect(l.symmetry).toBe(0);
  });

  it("builds edges with minute labels at both ends", () => {
    expect(model.edges.map((e) => [e.a, e.b, e.km])).toEqual([
      ["X", "Y", 30],
      ["Y", "Z", 30],
    ]);
    const xy = model.edges[0]!.lines[0]!;
    expect(xy).toMatchObject({
      aDep: 10,
      bArr: 30,
      bDep: 30,
      aArr: 50,
      travel: 20,
      travelBack: 20,
    });
  });

  it("derives Knotenzeiten per node", () => {
    const y = model.nodes.find((n) => n.id === "Y")!;
    expect(y.lines).toBe(2);
    expect(y.knots.arr[30]).toBe(1);
    expect(y.knots.arr[28]).toBe(1);
    expect(y.knots.dep[32]).toBe(1);
    expect(y.knots.type).toBe("halb");
  });
});
