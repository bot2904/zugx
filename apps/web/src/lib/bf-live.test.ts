import type { CorridorStation, CorridorTrain } from "@zugx/netz";
import { describe, expect, it } from "vite-plus/test";
import {
  addEvent,
  alongCorridor,
  buildRuns,
  livePaths,
  minutesOn,
  newLiveState,
  plannedTrain,
  trainKey,
} from "./bf-live.ts";

const st = (hafasId: string, km: number): CorridorStation => ({
  id: hafasId,
  name: hafasId,
  km,
  major: true,
  hafasId,
});
const stations = [st("A", 0), st("P", 25), st("B", 50), st("C", 100)];
const DAY = "2026-11-14";
const hm = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3);
const ev = (planned: string, actual?: string) => ({
  planned: `${DAY}T${planned}:00+01:00`,
  ...(actual ? { actual: `${DAY}T${actual}:00+01:00`, delay: hm(actual) - hm(planned) } : {}),
});
// GTFS: A 10:00/10:02, passes P (10:16, interpolated), B 10:30/10:32, C 11:00
const rjx: CorridorTrain = {
  cat: "RJX",
  nr: "162",
  dir: 1,
  origin: "Origin",
  headsign: "C",
  pts: [
    [0, 600, 602],
    [1, 616, 616],
    [2, 630, 632],
    [3, 660, null],
  ],
  days: "",
};
const K = trainKey("RJX", "162");

describe("Bildfahrplan live overlay", () => {
  it("minutes relative to the shown day", () => {
    expect(minutesOn(DAY, `${DAY}T10:05:00+01:00`)).toBe(605);
    expect(minutesOn(DAY, "2026-11-15T00:10:00+01:00")).toBe(1450);
  });

  it("GTFS train with realtime from boards: planned path, realtime where known", () => {
    const s = newLiveState();
    addEvent(s, K, 0, "dep", ev("10:02", "10:05"), DAY); // board at A
    addEvent(s, K, 2, "dep", ev("10:32", "10:38"), DAY); // board at B
    const r = buildRuns(s, [rjx], stations, 640).get(K)!;
    expect(r.pts.map((p) => p.i)).toEqual([0, 1, 2, 3]); // incl. the passing point
    expect(r.pts[0]).toEqual({ i: 0, arr: { plan: 600 }, dep: { plan: 602, rt: 605 } });
    expect(r.pts[2]!.dep).toEqual({ plan: 632, rt: 638 });
    expect(r.delay).toBe(6);
    expect(r.final).toBe(false);
    expect(buildRuns(s, [rjx], stations, 700).get(K)!.final).toBe(true);
  });

  it("no realtime → no live run", () => {
    const s = newLiveState();
    addEvent(s, K, 0, "dep", ev("10:02"), DAY);
    expect(buildRuns(s, [rjx], stations, 640).size).toBe(0);
  });

  it("splits the path at now, between realtime points planned + last delay", () => {
    const s = newLiveState();
    addEvent(s, K, 0, "dep", ev("10:02", "10:05"), DAY);
    const r = buildRuns(s, [rjx], stations, 640).get(K)!;
    const p = livePaths(
      r,
      (i) => i * 10,
      (m) => m,
      640,
    );
    // A arr 600 (no rt yet), dep 605; then +3: P 619, B 633/635, C 663
    expect(p.past).toBe("M0.0,600.0L0.0,605.0L10.0,619.0L20.0,633.0L20.0,635.0L21.8,640.0");
    expect(p.future).toBe("M21.8,640.0L30.0,663.0");
  });

  it("trains not in the GTFS: through the stations seen, only along the corridor", () => {
    const s = newLiveState();
    s.extra.set("WB 918", { cat: "WB", nr: "918", headsign: "C" });
    addEvent(s, "WB 918", 2, "dep", ev("10:40", "10:42"), DAY);
    addEvent(s, "WB 918", 0, "dep", ev("10:10", "10:11"), DAY);
    const r = buildRuns(s, [], stations, 650).get("WB 918")!;
    expect(r.hafasOnly).toBe(true);
    expect(r.pts.map((p) => p.i)).toEqual([0, 2]); // sorted by time
    expect(plannedTrain(r).pts).toEqual([
      [0, null, 610],
      [2, null, 640],
    ]);
    // Wien Hbf – Meidling only (3 km): not along the corridor
    expect(alongCorridor([0, 1], [st("A", 0), st("B", 3)])).toBe(false);
    expect(alongCorridor([0, 1, 2], [st("A", 0), st("B", 1), st("C", 2)])).toBe(true);
  });

  it("radar and board events merge per station", () => {
    const s = newLiveState();
    addEvent(s, K, 2, "arr", ev("10:30", "10:36"), DAY);
    addEvent(s, K, 2, "dep", ev("10:32", "10:38"), DAY, true);
    const r = buildRuns(s, [rjx], stations, 640).get(K)!;
    expect(r.pts[2]).toEqual({
      i: 2,
      arr: { plan: 630, rt: 636 },
      dep: { plan: 632, rt: 638 },
      cancelled: true,
    });
  });
});
