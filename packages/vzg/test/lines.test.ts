import { describe, expect, it } from "vite-plus/test";
import {
  curveSections,
  distKm,
  fitChainage,
  parsePosition,
  parseSpeed,
  shortestPath,
  trackGraph,
  trackOf,
} from "../src/lines.ts";

describe("OSM values", () => {
  it("parses railway:position", () => {
    expect(parsePosition("35.129")).toBe(35.129);
    expect(parsePosition("35,129")).toBe(35.129);
    expect(parsePosition("35.1+20")).toBeCloseTo(35.12);
    expect(parsePosition("-0.264")).toBe(-0.264);
    expect(parsePosition("12.3;12.4")).toBe(12.3);
    expect(parsePosition("abc")).toBeNull();
    expect(parsePosition(undefined)).toBeNull();
  });
  it("parses maxspeed", () => {
    expect(parseSpeed("100")).toBe(100);
    expect(parseSpeed("80 km/h")).toBe(80);
    expect(parseSpeed("60 mph")).toBe(97);
    expect(parseSpeed("signals")).toBeNull();
  });
  it("maps ÖBB section track numbers to the Regelgleis", () => {
    expect(trackOf("e21")).toBe("1");
    expect(trackOf("e22")).toBe("2");
    expect(trackOf("312")).toBe("2");
    expect(trackOf("3")).toBeNull();
    expect(trackOf(undefined)).toBeNull();
  });
});

describe("chainage", () => {
  it("interpolates between anchors and drops outliers", () => {
    const f = fitChainage([
      { s: 0, km: 10 },
      { s: 1, km: 11 },
      { s: 1.5, km: 99 }, // wrong position (another line)
      { s: 2, km: 12.2 },
    ])!;
    expect(f(0.5)).toBeCloseTo(10.5);
    expect(f(1.5)).toBeCloseTo(11.6);
    expect(f(3)).toBeCloseTo(13.2); // slope 1 beyond
  });
  it("handles decreasing km", () => {
    const f = fitChainage([
      { s: 0, km: 20 },
      { s: 2, km: 18 },
    ])!;
    expect(f(1)).toBeCloseTo(19);
    expect(f(3)).toBeCloseTo(17);
  });
  it("needs two anchors", () => expect(fitChainage([{ s: 0, km: 1 }])).toBeNull());
});

describe("geometry", () => {
  it("estimates the radius of a circular arc", () => {
    // arc of radius 500 m, 1 km long, preceded and followed by straights
    const R = 0.5 / 111.32; // degrees of latitude
    const pts: [number, number][] = [];
    for (let x = -1; x < 0; x += 0.01)
      pts.push([47, 11 + x / 111.32 / Math.cos((47 * Math.PI) / 180)]);
    const k = Math.cos((47 * Math.PI) / 180);
    for (let a = 0; a <= 2; a += 0.01)
      pts.push([47 + R - R * Math.cos(a), 11 + (R * Math.sin(a)) / k]);
    const s = [0];
    for (let i = 1; i < pts.length; i++) s.push(s[i - 1]! + distKm(pts[i - 1]!, pts[i]!));
    const curves = curveSections(pts, s);
    expect(curves.length).toBe(1);
    const [from, to, r] = curves[0]!;
    expect(r).toBeGreaterThan(470);
    expect(r).toBeLessThan(530);
    expect(from).toBeGreaterThan(0.8);
    expect(to - from).toBeGreaterThan(0.8);
  });
  it("finds the cheapest path", () => {
    const coords = { 1: [47, 11], 2: [47, 11.01], 3: [47, 11.02], 4: [47.01, 11.01] } as Record<
      number,
      [number, number]
    >;
    const way = (id: number, nodes: number[], ref = "") => ({ id, nodes, tags: { ref } });
    const adj = trackGraph([way(1, [1, 2, 3], "101 01"), way(2, [1, 4, 3])], coords);
    const p = shortestPath(adj, 1, 3, (e) => e.len * (e.way.tags.ref ? 1 : 0.1))!;
    expect(p.map((e) => e.b)).toEqual([4, 3]);
    const q = shortestPath(adj, 1, 3, (e) => e.len)!;
    expect(q.map((e) => e.b)).toEqual([2, 3]);
    expect(shortestPath(adj, 1, 99, (e) => e.len)).toBeNull();
  });
});
