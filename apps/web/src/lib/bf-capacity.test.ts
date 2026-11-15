import type { CorridorTrain } from "@zugx/netz";
import { describe, expect, it } from "vite-plus/test";
import {
  BLOCK_DEFAULTS,
  blockBounds,
  blockingTimes,
  blockTable,
  markConflicts,
} from "./bf-capacity.ts";

const train = (nr: string, dir: 1 | -1, pts: CorridorTrain["pts"], cat = "R"): CorridorTrain => ({
  cat,
  nr,
  dir,
  origin: "",
  headsign: "",
  pts,
  days: "",
});

// stations at km 0 and 10; signals for direction 1 at 0.2, 5 (block signal), 9.8
const km = [0, 10];
const blocks = { up: [0.2, 5, 9.8], down: [9.8, 5, 0.2], known: [[0, 10]] as [number, number][] };
// 60 km/h: 1 km per minute; departs 8:00 (480) at km 0, arrives 490 at km 10
const t1 = train("1", 1, [
  [0, null, 480],
  [1, 490, null],
]);

describe("block bounds", () => {
  it("signals per direction within the section, stations only where no signal data", () => {
    expect(blockBounds(blocks, km, 0, 10, 1)).toEqual([0, 0.2, 5, 9.8, 10]);
    expect(blockBounds(blocks, km, 0, 10, -1)).toEqual([10, 9.8, 5, 0.2, 0]);
    expect(blockBounds(undefined, km, 0, 10, 1)).toEqual([0, 10]);
  });
});

describe("blocking times", () => {
  const bounds = blockBounds(blocks, km, 0, 10, 1);
  const p = { ...BLOCK_DEFAULTS, approach: 1000, setup: 0.5, release: 0.1, lengthMU: 200 };
  it("approach + running + clearing per block", () => {
    const bx = blockingTimes(t1, km, bounds, p);
    // block 0.2–5: the train stands at km 0 before it → departure 480 − 0.5; clears 5 + 0.2 at 485.2 + 0.1
    const b1 = bx.find((x) => x.from === 0.2)!;
    expect(b1.start).toBeCloseTo(479.5);
    expect(b1.end).toBeCloseTo(485.3);
    // block 5–9.8: distant signal at 4 → 484 − 0.5; clears 9.8 + 0.2 = 10 → 490 + 0.1
    const b2 = bx.find((x) => x.from === 5)!;
    expect(b2.start).toBeCloseTo(483.5);
    expect(b2.end).toBeCloseTo(490.1);
  });
  it("following train too close → conflict; table with occupancy", () => {
    const t2 = train("2", 1, [
      [0, null, 483],
      [1, 493, null],
    ]);
    const boxes = [t1, t2].flatMap((t) => blockingTimes(t, km, bounds, p));
    markConflicts(boxes, [], km);
    expect(boxes.filter((x) => x.conflict).length).toBeGreaterThan(0);
    const rows = blockTable(boxes, 470, 500);
    const r = rows.find((x) => x.from === 5)!;
    expect(r.n).toBe(2);
    expect(r.conflicts).toBe(2);
    // union 483.5–493.1 = 9.6 of 30 minutes
    expect(r.occupancy).toBeCloseTo(9.6 / 30);
    const t3 = train("3", 1, [
      [0, null, 495],
      [1, 505, null],
    ]);
    const ok = [t1, t3].flatMap((t) => blockingTimes(t, km, bounds, p));
    markConflicts(ok, [], km);
    expect(ok.some((x) => x.conflict)).toBe(false);
  });
  it("opposite directions on single track between stations conflict", () => {
    const down = train("9", -1, [
      [1, null, 482],
      [0, 492, null],
    ]);
    const boxes = [
      ...blockingTimes(t1, km, bounds, p),
      ...blockingTimes(down, km, blockBounds(blocks, km, 0, 10, -1), p),
    ];
    markConflicts(boxes, [[0, 10, 1]], km);
    expect(boxes.some((x) => x.conflict)).toBe(true);
    for (const x of boxes) delete x.conflict;
    markConflicts(boxes, [[0, 10, 2]], km); // double track: independent
    expect(boxes.some((x) => x.conflict)).toBe(false);
  });
});

describe("coupled trains", () => {
  it("portions running together are one train, not a conflict", async () => {
    const { mergeCoupled } = await import("./bf-capacity.ts");
    const bounds = blockBounds(blocks, km, 0, 10, 1);
    const a = train(
      "260",
      1,
      [
        [0, null, 480],
        [1, 490, null],
      ],
      "RJX",
    );
    const b = train(
      "660",
      1,
      [
        [0, null, 480],
        [1, 490, null],
      ],
      "RJX",
    );
    const boxes = mergeCoupled([a, b].flatMap((t) => blockingTimes(t, km, bounds)));
    markConflicts(boxes, [], km);
    expect(boxes.every((x) => x.t === a)).toBe(true);
    expect(boxes.some((x) => x.conflict)).toBe(false);
  });
});
