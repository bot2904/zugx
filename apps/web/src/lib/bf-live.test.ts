import type { CorridorStation, CorridorTrain } from "@zugx/netz";
import { describe, expect, it } from "vite-plus/test";
import {
  addEvent,
  alongCorridor,
  buildRuns,
  crossesBypass,
  eventTimes,
  livePaths,
  plannedPieces,
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

  it("trains not in the GTFS taking another way between two stations are left out", () => {
    // timetable: A → C in 58′ (RJX 162); IR seen at A and C 3 hours apart (runs via elsewhere)
    const s = newLiveState();
    s.extra.set("IR 583", { cat: "IR", nr: "583", headsign: "C" });
    addEvent(s, "IR 583", 0, "dep", ev("08:10", "08:10"), DAY);
    addEvent(s, "IR 583", 3, "arr", ev("11:11", "11:11"), DAY);
    expect(buildRuns(s, [rjx], stations, 680).has("IR 583")).toBe(false);
    // the same within plausible time: drawn
    s.extra.set("IR 585", { cat: "IR", nr: "585", headsign: "C" });
    addEvent(s, "IR 585", 0, "dep", ev("10:10", "10:10"), DAY);
    addEvent(s, "IR 585", 3, "arr", ev("11:20", "11:21"), DAY);
    expect(buildRuns(s, [rjx], stations, 690).has("IR 585")).toBe(true);
    // far faster than any timetable train (a shorter way elsewhere): left out too
    s.extra.set("RJX 186", { cat: "RJX", nr: "186", headsign: "C" });
    addEvent(s, "RJX 186", 0, "dep", ev("10:00", "10:00"), DAY);
    addEvent(s, "RJX 186", 3, "arr", ev("10:25", "10:25"), DAY);
    expect(buildRuns(s, [rjx], stations, 690).has("RJX 186")).toBe(false);
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

  it("a station with only the departure reported: the arrival gets about that delay (RJ 755 in Bruck)", () => {
    // Graz dep 1020 +1, Bruck arr 1055 (no rt) / dep 1057 +8, Mürzzuschlag arr 1084 (no rt)
    const t = eventTimes([
      undefined,
      { plan: 1020, rt: 1021 },
      { plan: 1055 },
      { plan: 1057, rt: 1065 },
      { plan: 1084 },
    ]);
    expect(t[2]).toBeCloseTo(1055 + 1 + (35 / 37) * 7, 5); // ≈ +7.6, not +1
    expect(t[4]).toBe(1084 + 8); // after the last report: its delay
  });

  it("trains known only from realtime aren't drawn across a parallel-line stretch", () => {
    // stations 0..4; the timetable's trains take a parallel line between 1 and 4
    const bypass: [number, number][] = [[1, 4]];
    expect(crossesBypass(1, 4, bypass)).toBe(true);
    expect(crossesBypass(0, 4, bypass)).toBe(true);
    expect(crossesBypass(1, 2, bypass)).toBe(false);
    const r = {
      key: "WB 1009",
      cat: "WB",
      nr: "1009",
      origin: "A",
      headsign: "E",
      hafasOnly: true,
      final: false,
      pts: [
        { i: 0, dep: { plan: 600, rt: 601 } },
        { i: 1, arr: { plan: 605, rt: 606 }, dep: { plan: 606, rt: 607 } },
        { i: 4, arr: { plan: 630, rt: 631 }, dep: { plan: 632, rt: 633 } },
        { i: 5, arr: { plan: 640, rt: 641 } },
      ],
    };
    expect(plannedPieces(r, bypass).map((t) => t.pts.map(([i]) => i))).toEqual([
      [0, 1],
      [4, 5],
    ]);
    const p = livePaths(
      r,
      (i) => i * 10,
      (m) => m,
      700,
      bypass,
    );
    expect(p.past).toBe("M0.0,601.0L10.0,606.0L10.0,607.0M40.0,631.0L40.0,633.0L50.0,641.0");
  });
});
