import type { Trip } from "@zugx/hafas";
import type { CorridorStation } from "@zugx/netz";
import { describe, expect, it } from "vite-plus/test";
import { liveRunOf, livePaths, minutesOn, plannedTrain, trainKey } from "./bf-live.ts";

const st = (hafasId: string, km: number): CorridorStation => ({
  id: hafasId,
  name: hafasId,
  km,
  major: true,
  hafasId,
});
const stations = [st("A", 0), st("B", 50), st("C", 100)];
const line = {
  name: "RJX 162",
  category: "RJX",
  number: "162",
  cls: 1,
  product: "highspeed" as const,
};
const ev = (planned: string, actual?: string) => ({
  planned: `2026-11-14T${planned}:00+01:00`,
  ...(actual
    ? {
        actual: `2026-11-14T${actual}:00+01:00`,
        delay:
          +actual.slice(0, 2) * 60 +
          +actual.slice(3) -
          (+planned.slice(0, 2) * 60 + +planned.slice(3)),
      }
    : {}),
});
const trip: Trip = {
  journeyId: "j1",
  date: "2026-11-14",
  line,
  direction: "C",
  remarks: [],
  stopovers: [
    { stop: { id: "X", name: "Origin" } as never, dep: ev("09:00", "09:00") },
    { stop: { id: "A", name: "A" } as never, arr: ev("10:00", "10:03"), dep: ev("10:02", "10:05") },
    { stop: { id: "B", name: "B" } as never, arr: ev("10:30", "10:36"), dep: ev("10:32") },
    { stop: { id: "C", name: "C" } as never, arr: ev("11:00") },
  ],
};

describe("Bildfahrplan live overlay", () => {
  it("minutes relative to the shown day", () => {
    expect(minutesOn("2026-11-14", "2026-11-14T10:05:00+01:00")).toBe(605);
    expect(minutesOn("2026-11-14", "2026-11-15T00:10:00+01:00")).toBe(1450);
  });
  it("maps a HAFAS run onto the corridor stations", () => {
    const r = liveRunOf(trip, stations, "2026-11-14", 640, false)!;
    expect(r.key).toBe(trainKey("RJX", "162"));
    expect(r.pts.map((p) => p.i)).toEqual([0, 1, 2]);
    expect(r.pts[0]).toEqual({ i: 0, arr: { plan: 600, rt: 603 }, dep: { plan: 602, rt: 605 } });
    expect(r.delay).toBe(6);
    expect(r.final).toBe(false);
    expect(liveRunOf(trip, stations, "2026-11-14", 700, false)!.final).toBe(true);
    expect(
      liveRunOf(
        { ...trip, stopovers: trip.stopovers.slice(0, 2) },
        stations,
        "2026-11-14",
        0,
        false,
      ),
    ).toBeNull();
  });
  it("splits the path at now, forecast shifted by the last known delay", () => {
    const r = liveRunOf(trip, stations, "2026-11-14", 640, false)!;
    const p = livePaths(
      r,
      (i) => i * 10,
      (m) => m,
      640,
    );
    // departure B without realtime: planned 632 + 6 = 638 (not 632, before the arrival)
    expect(p.past).toBe("M0.0,603.0L0.0,605.0L10.0,636.0L10.0,638.0L10.7,640.0");
    // arrival C: 660 + 6 = 666, after now → forecast
    expect(p.future).toBe("M10.7,640.0L20.0,666.0");
  });
  it("normalises lower-case HAFAS categories", () => {
    const s = { ...trip, line: { ...line, category: "s", number: "2", trainNumber: "22750" } };
    const r = liveRunOf(s, stations, "2026-11-14", 640, true)!;
    expect([r.key, r.cat, r.nr]).toEqual(["S 22750", "S", "22750"]);
  });
  it("planned train for HAFAS-only runs", () => {
    const r = liveRunOf(trip, stations, "2026-11-14", 640, true)!;
    const t = plannedTrain(r);
    expect(t.pts).toEqual([
      [0, 600, 602],
      [1, 630, 632],
      [2, 660, null],
    ]);
    expect(t.dir).toBe(1);
  });
});
