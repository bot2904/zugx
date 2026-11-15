// Stop times without a time (allowed in GTFS for stops that aren't timepoints, timepoint = 0):
// interpolated between the neighbouring timed stops, as the spec asks consumers to — by
// shape_dist_traveled where both neighbours have it, else evenly by position. Seconds rounded;
// arrival = departure (a stop without a published dwell).
import type { Db } from "./query.ts";

const sec = (t: string) => {
  const [h = 0, m = 0, s = 0] = t.split(":").map(Number);
  return h * 3600 + m * 60 + s;
};
const hms = (s: number) =>
  [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
    .map((v) => String(v).padStart(2, "0"))
    .join(":");

interface Row {
  trip_id: string;
  stop_sequence: number;
  arrival_time: string | null;
  departure_time: string | null;
  shape_dist_traveled: number | null;
}

/** the interpolated times of one trip's stops (sorted by stop_sequence): index → seconds */
export function interpolateTrip(
  stops: Omit<Row, "trip_id" | "stop_sequence">[],
): Map<number, number> {
  const out = new Map<number, number>();
  const timed = (r: (typeof stops)[number]) => !!(r.arrival_time || r.departure_time);
  for (let i = 0; i < stops.length; i++) {
    if (timed(stops[i]!)) continue;
    let a = i - 1;
    while (a >= 0 && !timed(stops[a]!)) a--;
    let b = i + 1;
    while (b < stops.length && !timed(stops[b]!)) b++;
    if (a < 0 || b >= stops.length) continue; // before the first / after the last timed stop
    const ra = stops[a]!;
    const rb = stops[b]!;
    const ta = sec(ra.departure_time || ra.arrival_time!);
    const tb = sec(rb.arrival_time || rb.departure_time!);
    const [da, db, di] = [
      ra.shape_dist_traveled,
      rb.shape_dist_traveled,
      stops[i]!.shape_dist_traveled,
    ];
    const f =
      da !== null && db !== null && di !== null && db > da
        ? (di - da) / (db - da)
        : (i - a) / (b - a);
    out.set(i, Math.round(ta + Math.min(1, Math.max(0, f)) * (tb - ta)));
  }
  return out;
}

/** fill in the missing stop times of all trips; returns the number of stop times filled */
export function interpolateStopTimes(db: Db): number {
  const missing = db
    .prepare(
      `select distinct trip_id from stop_times
        where coalesce(arrival_time, '') = '' or coalesce(departure_time, '') = ''`,
    )
    .all() as { trip_id: string }[];
  if (!missing.length) return 0;
  const read = db.prepare(
    `select trip_id, stop_sequence, arrival_time, departure_time, shape_dist_traveled
       from stop_times where trip_id = ? order by stop_sequence`,
  );
  const write = db.prepare(
    `update stop_times set arrival_time = ?, departure_time = ? where trip_id = ? and stop_sequence = ?`,
  );
  // a stop with only one of the two times: the other is the same
  const fillHalf = db.prepare(
    `update stop_times set arrival_time = coalesce(nullif(arrival_time, ''), departure_time),
            departure_time = coalesce(nullif(departure_time, ''), arrival_time)
      where trip_id = ?`,
  );
  let n = 0;
  db.transaction(() => {
    for (const { trip_id } of missing) {
      fillHalf.run(trip_id);
      const rows = read.all(trip_id) as Row[];
      for (const [i, s] of interpolateTrip(rows)) {
        write.run(hms(s), hms(s), trip_id, rows[i]!.stop_sequence);
        n++;
      }
    }
  })();
  return n;
}
