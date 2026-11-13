import { describe, expect, it } from "vite-plus/test";
import { nodeKnots, symmetryDeviation } from "../src/netz.ts";
import { circDist, circMedian, detectTakt, taktFamilies } from "../src/takt.ts";

/** departures every `T` minutes at minute `m`, from hour h0 to h1 */
const series = (T: number, m: number, h0 = 5, h1 = 22) => {
  const out: number[] = [];
  for (let t = h0 * 60 + m; t <= h1 * 60; t += T) out.push(t);
  return out;
};

describe("circular helpers", () => {
  it("measures distance modulo m", () => {
    expect(circDist(58, 2, 60)).toBe(4);
    expect(circDist(10, 40, 60)).toBe(30);
    expect(circDist(29, 1, 30)).toBe(2);
  });
  it("finds the circular median", () => {
    expect(circMedian([58, 59, 1, 2, 0], 60)).toBe(0);
    expect(circMedian([10, 11, 12], 60)).toBe(11);
  });
});

describe("detectTakt", () => {
  it("detects an hourly line", () => {
    const r = detectTakt(series(60, 12));
    expect(r.takt).toBe(60);
    expect(r.phase).toBe(12);
    expect(r.members).toHaveLength(series(60, 12).length);
  });

  it("detects a 30' line and prefers it over 60'", () => {
    const r = detectTakt(series(30, 7));
    expect(r.takt).toBe(30);
    expect(r.phase).toBe(7);
  });

  it("detects a 15' S-Bahn", () => {
    expect(detectTakt(series(15, 4)).takt).toBe(15);
  });

  it("detects a 2-hourly line", () => {
    const r = detectTakt(series(120, 33, 6, 20));
    expect(r.takt).toBe(120);
    expect(r.phase).toBe(mod120(6 * 60 + 33));
  });

  it("tolerates ±2 min jitter and a missing slot", () => {
    const times = series(60, 20).map((t, i) => t + ((i % 3) - 1) * 2);
    times.splice(5, 1);
    const r = detectTakt(times);
    expect(r.takt).toBe(60);
    expect(circDist(r.phase, 20, 60)).toBeLessThanOrEqual(2);
  });

  it("returns null for irregular departures", () => {
    expect(detectTakt([400, 517, 731, 1002]).takt).toBeNull();
    expect(detectTakt([480]).takt).toBeNull();
  });

  it("does not call a 60' line with every second train missing a 60' Takt", () => {
    // only 7, 9, 11, … → 120
    expect(detectTakt(series(120, 5, 7, 21)).takt).toBe(120);
  });
});

describe("taktFamilies", () => {
  it("separates two hourly families with an irregular offset", () => {
    const a = series(60, 0, 6, 20);
    const b = series(60, 25, 6, 20);
    const fams = taktFamilies([...a, ...b]);
    const takt = fams.filter((f) => f.takt === 60);
    expect(takt).toHaveLength(2);
    expect(takt.map((f) => f.phase).sort((x, y) => x - y)).toEqual([0, 25]);
  });

  it("puts extra peak trains into a null family", () => {
    const fams = taktFamilies([...series(60, 10, 6, 20), 437, 1037]);
    expect(fams[0]!.takt).toBe(60);
    expect(fams[1]!.takt).toBeNull();
    expect(fams[1]!.members).toHaveLength(2);
  });
});

describe("symmetry", () => {
  it("is 0 for a timetable symmetric around :00", () => {
    const fwd = [
      { node: "A", arr: null, dep: 5 },
      { node: "B", arr: 40, dep: 42 },
      { node: "C", arr: 58, dep: null },
    ];
    // mirrored: minute m ↔ 60 − m
    const back = [
      { node: "C", arr: null, dep: 2 },
      { node: "B", arr: 18, dep: 20 },
      { node: "A", arr: 55, dep: null },
    ];
    expect(symmetryDeviation(fwd, back, 60)).toBe(0);
  });

  it("reports the offset of the symmetry axis", () => {
    const fwd = [{ node: "A", arr: null, dep: 10 }];
    const back = [{ node: "A", arr: 54, dep: null }]; // 10 + 54 = 64 → axis :02
    expect(symmetryDeviation(fwd, back, 60)).toBe(2);
  });

  it("returns null without common nodes", () => {
    expect(symmetryDeviation([{ node: "A", arr: null, dep: 1 }], [], 60)).toBeNull();
  });
});

describe("nodeKnots", () => {
  it("classifies a Vollknoten", () => {
    const k = nodeKnots([
      { arr: 55, dep: 3, takt: 60 },
      { arr: 57, dep: 5, takt: 60 },
      { arr: 52, dep: 2, takt: 60 },
    ]);
    expect(k.type).toBe("voll");
    expect(k.minutes).toEqual([0]);
    expect(k.share).toBe(1);
  });

  it("finds a :00/:30 knot for 30' lines", () => {
    const k = nodeKnots([
      { arr: 25, dep: 33, takt: 30 },
      { arr: 27, dep: 35, takt: 30 },
    ]);
    expect(k.minutes).toEqual([0, 30]);
    expect(k.arr[55]).toBe(1);
  });

  it("finds a Viertelknoten", () => {
    const k = nodeKnots([
      { arr: 10, dep: 18, takt: 60 },
      { arr: 12, dep: 20, takt: 60 },
    ]);
    expect(k.type).toBe("viertel");
  });

  it("returns null with too few Takt lines", () => {
    expect(nodeKnots([{ arr: 55, dep: 5, takt: 60 }]).type).toBeNull();
    expect(nodeKnots([{ arr: 55, dep: 5, takt: null }]).type).toBeNull();
  });
});

function mod120(t: number) {
  return ((t % 120) + 120) % 120;
}
