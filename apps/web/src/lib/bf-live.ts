// Bildfahrplan live overlay ("Aramis für Arme"): realtime train paths from ÖBB HAFAS (Scotty) on
// top of the planned GTFS paths. Only for today. Discovery: departure boards at the major
// stations of the shown section (finds every train stopping there, also WESTbahn & co. that are
// not in the GTFS) + JourneyMatch for GTFS trains that pass them without stopping; then one
// JourneyDetails per train (realtime at every stop). Trains that have finished are fetched once,
// running ones refreshed every minute.
import type { HafasClient, Line, Trip } from "@zugx/hafas";
import { RAIL_PRODUCTS, VIENNA } from "@zugx/hafas";
import type { CorridorStation, CorridorTrain } from "@zugx/netz";
import { daysBetween, minutesOfDay } from "./format.ts";

/** a station event of a live run: minutes since midnight of the shown day */
export interface LivePt {
  /** index into the corridor's stations */
  i: number;
  arr?: { plan: number; rt?: number };
  dep?: { plan: number; rt?: number };
  cancelled?: boolean;
}

export interface LiveRun {
  /** "RJX 162" — same key as the GTFS train */
  key: string;
  cat: string;
  nr: string;
  journeyId: string;
  origin: string;
  headsign: string;
  pts: LivePt[];
  /** not in the GTFS (known from HAFAS only, e.g. WESTbahn) */
  hafasOnly: boolean;
  /** run over (in the corridor): no more refreshes */
  final: boolean;
  /** latest known delay in minutes (last event with realtime) */
  delay?: number;
}

export const trainKey = (cat: string, nr: string) => `${cat.toUpperCase()} ${nr}`;
/** HAFAS writes some categories in lower case ("s" for S-Bahn); the GTFS has "S" */
const normCat = (cat: string) => (/^[a-z]+$/.test(cat) ? cat.toUpperCase() : cat);
/** HAFAS line → train key: S-Bahn lines carry the train number separately ("S 2" = 22734) */
export const lineKey = (l: Line) => trainKey(l.category, l.trainNumber ?? l.number);

/** minutes since midnight of `day` (may be negative or exceed 1440) */
export const minutesOn = (day: string, iso: string) =>
  minutesOfDay(iso) + 1440 * daysBetween(day, iso.slice(0, 10));

/**
 * HAFAS train run → live run on the corridor: its stops at corridor stations (matched by HAFAS
 * id), planned and realtime minutes. `null` if fewer than two corridor stations.
 */
export function liveRunOf(
  trip: Trip,
  stations: CorridorStation[],
  day: string,
  nowMin: number,
  hafasOnly: boolean,
): LiveRun | null {
  const idx = new Map<string, number>();
  stations.forEach((s, i) => s.hafasId && idx.set(s.hafasId, i));
  const pts: LivePt[] = [];
  let delay: number | undefined;
  const ev = (e?: { planned: string; actual?: string; delay?: number }) => {
    if (!e) return undefined;
    if (e.actual && e.delay !== undefined) delay = e.delay;
    return {
      plan: minutesOn(day, e.planned),
      ...(e.actual ? { rt: minutesOn(day, e.actual) } : {}),
    };
  };
  for (const so of trip.stopovers) {
    const i = idx.get(so.stop.id);
    const arr = ev(so.arr);
    const dep = ev(so.dep);
    if (i === undefined) continue;
    pts.push({
      i,
      ...(arr ? { arr } : {}),
      ...(dep ? { dep } : {}),
      ...(so.cancelled ? { cancelled: true } : {}),
    });
  }
  if (pts.length < 2) return null;
  const last = pts.at(-1)!;
  const end = last.arr?.rt ?? last.arr?.plan ?? last.dep?.rt ?? last.dep?.plan ?? 0;
  const first = trip.stopovers[0]?.stop.name ?? "";
  return {
    key: lineKey(trip.line),
    cat: normCat(trip.line.category),
    nr: trip.line.trainNumber ?? trip.line.number,
    journeyId: trip.journeyId,
    origin: first,
    headsign: trip.direction,
    pts,
    hafasOnly,
    final: end < nowMin - 5,
    ...(delay !== undefined ? { delay } : {}),
  };
}

/** live run as a corridor train (planned times) so HAFAS-only trains draw like the others */
export function plannedTrain(r: LiveRun): CorridorTrain {
  const pts = r.pts.map(
    (p) => [p.i, p.arr?.plan ?? null, p.dep?.plan ?? null] as CorridorTrain["pts"][number],
  );
  const a = r.pts[0]!.i;
  const b = r.pts.at(-1)!.i;
  return {
    cat: r.cat,
    nr: r.nr,
    dir: b >= a ? 1 : -1,
    origin: r.origin,
    headsign: r.headsign,
    pts,
    days: "",
  };
}

/**
 * Path pieces of a live run in screen coordinates, split at "now": solid up to now (actual),
 * dashed after (forecast). Realtime where known, else planned + the last known delay.
 */
export function livePaths(
  r: LiveRun,
  x: (i: number) => number | undefined,
  y: (min: number) => number,
  nowMin: number,
): { past: string; future: string; end?: [number, number] } {
  const pts: [number, number][] = [];
  // events without realtime: planned + the last known delay; never earlier than the event before
  let lastDelay = 0;
  let prev = Number.NEGATIVE_INFINITY;
  const t = (e?: { plan: number; rt?: number }) => {
    if (!e) return undefined;
    if (e.rt !== undefined) lastDelay = e.rt - e.plan;
    prev = Math.max(prev, e.rt ?? e.plan + lastDelay);
    return prev;
  };
  // time points per station in running order: arrival then departure
  const tm: [number, number][] = [];
  for (const p of r.pts) {
    const px = x(p.i);
    const a = t(p.arr);
    const d = t(p.dep);
    if (px === undefined) continue;
    if (a !== undefined) tm.push([px, a]);
    if (d !== undefined && d !== a) tm.push([px, d]);
  }
  for (const [px, m] of tm) pts.push([px, m]);
  const past: [number, number][][] = [[]];
  const future: [number, number][][] = [[]];
  for (let k = 0; k < pts.length; k++) {
    const [px, m] = pts[k]!;
    if (m <= nowMin) past.at(-1)!.push([px, y(m)]);
    else {
      const prev = pts[k - 1];
      if (prev && prev[1] <= nowMin) {
        // crossing "now": split the segment
        const f = (nowMin - prev[1]) / (m - prev[1] || 1);
        const cx = prev[0] + f * (px - prev[0]);
        past.at(-1)!.push([cx, y(nowMin)]);
        future.at(-1)!.push([cx, y(nowMin)]);
      }
      future.at(-1)!.push([px, y(m)]);
    }
  }
  const d = (rs: [number, number][][]) =>
    rs
      .filter((s) => s.length > 1)
      .map((s) => s.map(([a, b], k) => `${k ? "L" : "M"}${a.toFixed(1)},${b.toFixed(1)}`).join(""))
      .join("");
  const lastPast = past.at(-1)!.at(-1);
  return { past: d(past), future: d(future), ...(lastPast ? { end: lastPast } : {}) };
}

/** run `fn` over `items` with at most `n` in flight */
export async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]!).catch(() => {});
    }),
  );
}

export type LiveClient = Pick<HafasClient, "board" | "tripsByName" | "trip">;

/**
 * One discovery + refresh round. `known` carries the runs between rounds (finished ones are kept,
 * running ones refetched). Returns the updated runs.
 */
export async function refreshLive(o: {
  client: LiveClient;
  day: string;
  nowMin: number;
  /** visible window, minutes */
  t0: number;
  t1: number;
  stations: CorridorStation[];
  /** station indices of the shown section */
  lo: number;
  hi: number;
  /** GTFS trains of the day */
  trains: CorridorTrain[];
  known: Map<string, LiveRun>;
  /** journey ids looked up before (key → id; "" = not found) */
  ids: Map<string, string>;
  maxTrips?: number;
  /** called with the runs so far after each train (draw progressively) */
  onProgress?: (runs: Map<string, LiveRun>) => void;
}): Promise<Map<string, LiveRun>> {
  const { client, day, nowMin, stations, lo, hi } = o;
  // realtime exists for the past and the near future only
  const w0 = o.t0;
  const w1 = Math.min(o.t1, nowMin + 60);
  const out = new Map(o.known);
  if (w1 <= w0) return out;
  const gtfs = new Map<string, CorridorTrain>();
  for (const t of o.trains) {
    const ms = t.pts
      .filter(([i]) => i >= lo && i <= hi)
      .flatMap(([, a, d]) => [a, d])
      .filter((v): v is number => v !== null);
    if (ms.length && Math.min(...ms) <= w1 && Math.max(...ms) >= w0)
      gtfs.set(trainKey(t.cat, t.nr), t);
  }
  // 1. departure boards at (up to 4) major stations of the section
  const majors = stations
    .map((s, i) => ({ s, i }))
    .filter(({ s, i }) => i >= lo && i <= hi && s.major && s.hafasId);
  const pick =
    majors.length <= 4
      ? majors
      : [0, 1, 2, 3].map((k) => majors[Math.round((k * (majors.length - 1)) / 3)]!);
  // wall-clock minute of the shown day → point in time (Vienna)
  const at = (m: number) =>
    Temporal.PlainDate.from(day)
      .toZonedDateTime({ timeZone: VIENNA })
      .add({ minutes: Math.round(m) });
  // trains not in the GTFS: only those stopping at two or more of the boards' stations run along
  // the corridor (a big station's board also lists every other line)
  const seen = new Map<string, number>();
  await pool(pick, 2, async ({ s }) => {
    const b = await client.board(s.hafasId!, {
      when: at(w0 - 60), // trains in the window may have left this station up to an hour before
      duration: Math.min(1439, Math.round(w1 - w0 + 120)),
      results: 200,
      products: RAIL_PRODUCTS & ~2, // no rail replacement buses
    });
    for (const e of new Map(b.map((e) => [lineKey(e.line), e])).values()) {
      const k = lineKey(e.line);
      if (!o.ids.has(k)) o.ids.set(k, e.journeyId);
      if (!gtfs.has(k)) seen.set(k, (seen.get(k) ?? 0) + 1);
    }
  });
  const hafasOnly = new Set([...seen].filter(([, n]) => n >= 2).map(([k]) => k));
  // 2. GTFS trains not seen on a board: JourneyMatch
  const missing = [...gtfs.keys()].filter((k) => !o.ids.has(k));
  await pool(missing.slice(0, 20), 3, async (k) => {
    const m = await client.tripsByName(k, at(720));
    const hit = m.find((t) => lineKey(t.line) === k);
    o.ids.set(k, hit?.journeyId ?? "");
  });
  // 3. JourneyDetails for every candidate that is not final yet
  const todo = [...gtfs.keys(), ...hafasOnly]
    .filter((k) => o.ids.get(k) && !out.get(k)?.final)
    .slice(0, o.maxTrips ?? 60);
  await pool(todo, 3, async (k) => {
    const trip = await client.trip(o.ids.get(k)!, false);
    const run = liveRunOf(trip, stations, day, nowMin, hafasOnly.has(k));
    if (run) {
      out.set(k, { ...run, key: k });
      o.onProgress?.(new Map(out));
    } else o.ids.set(k, ""); // touches fewer than two corridor stations: don't ask again
  });
  return out;
}
