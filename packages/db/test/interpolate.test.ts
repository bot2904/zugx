import { describe, expect, it } from "vite-plus/test";
import { interpolateTrip } from "../src/interpolate.ts";

describe("interpolateTrip", () => {
  const r = (t: string | null, d: number | null = null) => ({
    arrival_time: t,
    departure_time: t,
    shape_dist_traveled: d,
  });
  it("places an untimed stop by distance between its timed neighbours", () => {
    // 09:00 at 0 m, 09:10 at 10 km: a stop at 2.5 km → 09:02:30
    const out = interpolateTrip([r("09:00:00", 0), r(null, 2500), r("09:10:00", 10000)]);
    expect(out.get(1)).toBe(9 * 3600 + 150);
  });
  it("spreads untimed stops evenly without distances, leaves the ends", () => {
    const out = interpolateTrip([r(null), r("10:00:00"), r(null), r(null), r("10:03:00"), r(null)]);
    expect([...out]).toEqual([
      [2, 36060],
      [3, 36120],
    ]);
  });
});
