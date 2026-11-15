// Timetable tables below the Bildfahrplan: the trains of one direction in the shown section and
// time window, with their times per shown station. Shared by the train-per-row table (BfTable)
// and the Kursbuch layout (BfBook, a column per train).
import type { CorridorTrain } from "@zugx/netz";

export interface TableStation {
  id: string;
  i: number;
  name: string;
  major: boolean;
  /** HAFAS station id (links to the station's departure plan) */
  hafasId?: string;
}
/** a train at one shown station: arrival, departure, or passing without a stop */
export interface StationTime {
  a: number | null;
  d: number | null;
  pass: boolean;
}
export interface TableRun {
  t: CorridorTrain;
  /** per shown station (display order); undefined = not served by this train */
  at: (StationTime | undefined)[];
  /** first and last shown station the train serves */
  firstK: number;
  lastK: number;
  /** time at the first served station (sort key) */
  first: number;
  /** origin, where it lies before the train's first shown station */
  from?: string;
  /** destination, where it lies beyond the train's last shown station */
  to?: string;
}

/**
 * passing points carry interpolated times with one decimal and arrival = departure (see
 * passingPoints in @zugx/netz); stops have whole minutes
 */
const isPass = (a: number | null, d: number | null) => a !== null && a === d && a % 1 !== 0;

export const hhmm = (min: number) =>
  `${Math.floor(min / 60) % 24}:${String(Math.round(min) % 60).padStart(2, "0")}`;

export function tableRuns(
  stations: TableStation[],
  trains: CorridorTrain[],
  dir: 1 | -1,
  t0: number,
  t1: number,
): TableRun[] {
  const col = new Map(stations.map((s, k) => [s.i, k]));
  const out: TableRun[] = [];
  for (const t of trains) {
    if (t.dir !== dir) continue;
    const at: (StationTime | undefined)[] = Array.from({ length: stations.length });
    let first: number | undefined;
    let firstK = -1;
    let lastK = -1;
    for (const [i, a, d] of t.pts) {
      const k = col.get(i);
      if (k === undefined || (a === null && d === null)) continue;
      first ??= d ?? a!;
      if (firstK < 0) firstK = k;
      at[k] = { a, d, pass: isPass(a, d) };
      lastK = Math.max(lastK, k);
    }
    // at least two stations of the section, starting in the time window
    if (first === undefined || first < t0 || first >= t1) continue;
    if (at.filter(Boolean).length < 2) continue;
    // stations between the first and last one without data: passed
    for (let k = firstK; k < lastK; k++) at[k] ??= { a: null, d: null, pass: true };
    const from = t.origin && t.origin !== stations[firstK]?.name ? t.origin : undefined;
    const to = t.headsign && t.headsign !== stations[lastK]?.name ? t.headsign : undefined;
    out.push({ t, at, firstK, lastK, first, ...(from ? { from } : {}), ...(to ? { to } : {}) });
  }
  return out.sort((x, y) => x.first - y.first);
}
