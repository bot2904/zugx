import type { CorridorTrain } from "@zugx/netz";
import { describe, expect, it } from "vite-plus/test";
import { connections, crossings, linesAtNode, nodeVerdict, runningReserve } from "./bf-plan.ts";

const train = (
  cat: string,
  nr: string,
  dir: 1 | -1,
  headsign: string,
  pts: CorridorTrain["pts"],
): CorridorTrain => ({ cat, nr, dir, origin: "", headsign, pts, days: "" });

describe("connections", () => {
  // station 1 is the node; R 1 arrives 8:00 and ends, RJ 2 leaves → at 8:02 (too short),
  // REX 3 → at 8:07, S 4 ← at 8:20
  const trains = [
    train("R", "1", 1, "B", [
      [0, null, 470],
      [1, 480, null],
    ]),
    train("RJ", "2", 1, "C", [
      [1, null, 482],
      [2, 500, null],
    ]),
    train("REX", "3", 1, "C", [
      [1, 486, 487],
      [2, 510, null],
    ]),
    train("S", "4", -1, "A", [
      [1, null, 500],
      [0, 530, null],
    ]),
  ];
  it("first connection per direction with the minimum transfer time, near miss", () => {
    const [c] = connections(trains, 1, 470, 490);
    expect(c!.arr.t.nr).toBe("1");
    const fwd = c!.dirs.find((d) => d.dir === 1)!;
    expect(fwd.continues).toBe(false);
    expect(fwd.next).toMatchObject({ wait: 7 });
    expect(fwd.next!.t.nr).toBe("3");
    expect(fwd.missed!.t.nr).toBe("2");
    expect(fwd.missed!.short).toBe(1);
    expect(c!.dirs.find((d) => d.dir === -1)!.next).toMatchObject({ wait: 20 });
  });
  it("a through train continues in its direction", () => {
    const c = connections(trains, 1, 480, 490).find((x) => x.arr.t.nr === "3")!;
    expect(c.dirs.find((d) => d.dir === 1)!.continues).toBe(true);
  });
});

describe("Taktknoten", () => {
  // hourly lines meeting around :00 at station 1: two arrive :55/:56, depart :03/:04
  const hourly = (cat: string, dir: 1 | -1, to: string, arr: number, dep: number) =>
    [6, 7, 8, 9].map((h, k) =>
      train(cat, `${cat}${dir}${k}`, dir, to, [[1, h * 60 + arr, h * 60 + dep]]),
    );
  const trains = [...hourly("REX", 1, "C", 55, 3 + 60), ...hourly("REX", -1, "A", 56, 4 + 60)];
  it("finds the lines with their minutes and headway", () => {
    const lines = linesAtNode(trains, 1);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ cat: "REX", n: 4, headway: 60, regular: 1 });
  });
  it("Vollknoten at :00 and the symmetry minute", () => {
    const v = nodeVerdict(linesAtNode(trains, 1));
    expect(v.minute).toBe(0);
    expect(v.meeting).toBe(2);
    // dep(→) :03 + arr(←) :56 = 59 → 29.5 (≙ :59.5)
    expect(v.symmetry).toEqual([{ cat: "REX", minute: 29.5 }]);
  });
});

describe("crossings", () => {
  // stations 0 (km 0), 1 (km 10), 2 (km 20); single track 0–20 except a loop at station 1
  const km = [0, 10, 20];
  const tracks: [number, number, number][] = [[0, 20, 1]];
  it("crossing at a station with buffers each way", () => {
    const up = train("R", "1", 1, "C", [
      [0, null, 480],
      [1, 490, 492],
      [2, 502, null],
    ]);
    const down = train("R", "2", -1, "A", [
      [2, null, 481],
      [1, 489, 494],
      [0, 504, null],
    ]);
    const [c] = crossings([up, down], km, tracks, 470, 520);
    expect(c).toMatchObject({ i: 1, conflict: false, bufUp: 3, bufDown: 4 });
  });
  it("meeting on single track between stations is a conflict", () => {
    const up = train("R", "1", 1, "C", [
      [0, null, 480],
      [1, 490, 490.5],
      [2, 500, null],
    ]);
    const down = train("R", "2", -1, "A", [
      [2, null, 482],
      [1, 495, 495.5],
      [0, 505, null],
    ]);
    const [c] = crossings([up, down], km, tracks, 470, 520);
    expect(c).toMatchObject({ i: 1, i2: 2, conflict: true });
    expect(c!.km).toBeGreaterThan(10);
    expect(c!.km).toBeLessThan(20);
  });
  it("double track: no crossing reported", () => {
    const up = train("R", "1", 1, "C", [
      [0, null, 480],
      [1, 490, 492],
      [2, 502, null],
    ]);
    const down = train("R", "2", -1, "A", [
      [2, null, 481],
      [1, 489, 494],
      [0, 504, null],
    ]);
    expect(crossings([up, down], km, [[0, 20, 2]], 470, 520)).toEqual([]);
  });
});

describe("running-time reserve", () => {
  it("scheduled time between stops vs. the minimum, passes skipped", () => {
    // stations 0–2; the train stops at 0 and 2, passes 1 (interpolated time with a decimal)
    const t = train("R", "1", 1, "C", [
      [0, null, 480],
      [1, 485.5, 485.5],
      [2, 492, null],
    ]);
    const rows = runningReserve(
      [t, { ...t, nr: "3" }],
      {
        R: [
          [4, 4],
          [5, 5],
        ],
      },
      [0, 4, 9],
      0,
      2,
    );
    // 9 km in 9′ at speed (16.7 m/s) + starting/stopping 16.7 / 0.7 s = 9.4′
    expect(rows).toEqual([{ from: 0, to: 2, cat: "R", dir: 1, n: 2, planned: 12, min: 9.4 }]);
  });
});
