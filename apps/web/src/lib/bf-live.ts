// Bildfahrplan live overlay ("Aramis für Arme"): realtime train paths from ÖBB HAFAS (Scotty) on
// top of the planned GTFS paths. Only for today. No per-train requests:
// - past: one departure board per major station of the shown section (+ arrival boards at the
//   section ends), once per window — every train there with its realtime;
// - now: one radar request (JourneyGeoPos) over the section per round — realtime of the stops
//   around every running train, also at minor stations;
// - the path: the GTFS path (incl. passing points) with realtime where known, planned + the last
//   known delay in between;
// - trains not in the GTFS (WESTbahn, renumbered trains): from boards and radar, if they run along
//   the corridor (≥ 3 of its stations or ≥ 10 km); drawn through the stations seen.
import type { HafasClient, Line, StopEvent } from "@zugx/hafas";
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
  origin: string;
  headsign: string;
  pts: LivePt[];
  /** not in the GTFS (known from HAFAS only, e.g. WESTbahn) */
  hafasOnly: boolean;
  /** run over (in the corridor) */
  final: boolean;
  /** latest known delay in minutes (last event with realtime) */
  delay?: number;
}

export const trainKey = (cat: string, nr: string) => `${cat.toUpperCase()} ${nr}`;
/** HAFAS writes some categories in lower case ("s" for S-Bahn); the GTFS has "S" */
export const normCat = (cat: string) => (/^[a-z]+$/.test(cat) ? cat.toUpperCase() : cat);
/** HAFAS line → train key: S-Bahn lines carry the train number separately ("S 2" = 22734) */
export const lineKey = (l: Line) => trainKey(l.category, l.trainNumber ?? l.number);

/** minutes since midnight of `day` (may be negative or exceed 1440) */
export const minutesOn = (day: string, iso: string) =>
  minutesOfDay(iso) + 1440 * daysBetween(day, iso.slice(0, 10));

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
): { past: string; future: string; end?: [number, number]; dots: [number, number][] } {
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
  const dots: [number, number][] = [];
  for (const p of r.pts) {
    const px = x(p.i);
    const a = t(p.arr);
    const d = t(p.dep);
    if (px === undefined) continue;
    // times reported by HAFAS (not interpolated): marked with a dot
    if (p.arr?.rt !== undefined) dots.push([px, y(p.arr.rt)]);
    if (p.dep?.rt !== undefined && p.dep.rt !== p.arr?.rt) dots.push([px, y(p.dep.rt)]);
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
  return { past: d(past), future: d(future), dots, ...(lastPast ? { end: lastPast } : {}) };
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

export type LiveClient = Pick<HafasClient, "board" | "radar">;

type Ev = { plan: number; rt?: number };
interface StationRt {
  arr?: Ev;
  dep?: Ev;
  cancelled?: boolean;
}

/** state kept between rounds (per day and corridor) */
export interface LiveState {
  /** train key → station index → realtime */
  rt: Map<string, Map<number, StationRt>>;
  /** trains seen in HAFAS that are not in the GTFS */
  extra: Map<string, { cat: string; nr: string; headsign: string }>;
  /** window the boards were fetched for ("lo-hi@t0-t1") */
  boardsFor?: string;
}
export const newLiveState = (): LiveState => ({ rt: new Map(), extra: new Map() });

/**
 * A train not in the GTFS belongs on the corridor if it stops at ≥ 3 of its stations or covers
 * ≥ 10 km of it (not just e.g. Wien Hbf – Meidling, which every Südbahn S-Bahn passes).
 */
export function alongCorridor(is: number[], stations: CorridorStation[]): boolean {
  const u = [...new Set(is)];
  if (u.length >= 3) return true;
  const kms = u.map((i) => stations[i]!.km);
  return u.length === 2 && Math.abs(kms[0]! - kms[1]!) >= 10;
}

/** record a HAFAS stop event of train `key` at corridor station `i` */
export function addEvent(
  st: LiveState,
  key: string,
  i: number,
  kind: "arr" | "dep",
  e: StopEvent | undefined,
  day: string,
  cancelled = false,
) {
  if (!e) return;
  const m = st.rt.get(key) ?? new Map<number, StationRt>();
  const old = m.get(i) ?? {};
  m.set(i, {
    ...old,
    [kind]: {
      plan: minutesOn(day, e.planned),
      ...(e.actual ? { rt: minutesOn(day, e.actual) } : {}),
    },
    ...(cancelled || e.cancelled || old.cancelled ? { cancelled: true } : {}),
  });
  st.rt.set(key, m);
}

/**
 * Live runs from the collected realtime: GTFS trains along their planned path (realtime where
 * known), trains not in the GTFS through the stations they were seen at. Only trains with at
 * least one realtime time.
 */
export function buildRuns(
  st: LiveState,
  trains: CorridorTrain[],
  stations: CorridorStation[],
  nowMin: number,
): Map<string, LiveRun> {
  const out = new Map<string, LiveRun>();
  const finish = (r: Omit<LiveRun, "final" | "delay">): LiveRun | null => {
    if (r.pts.length < 2) return null;
    let delay: number | undefined;
    let latest = Number.NEGATIVE_INFINITY;
    for (const p of r.pts)
      for (const e of [p.arr, p.dep])
        if (e?.rt !== undefined && e.rt <= nowMin + 1 && e.rt >= latest) {
          latest = e.rt;
          delay = e.rt - e.plan;
        }
    // no realtime yet at all (e.g. HAFAS only knows the plan): nothing to draw
    if (!r.pts.some((p) => p.arr?.rt !== undefined || p.dep?.rt !== undefined)) return null;
    const last = r.pts.at(-1)!;
    const end = last.arr?.rt ?? last.arr?.plan ?? last.dep?.rt ?? last.dep?.plan ?? 0;
    return { ...r, final: end < nowMin - 5, ...(delay !== undefined ? { delay } : {}) };
  };
  for (const t of trains) {
    const key = trainKey(t.cat, t.nr);
    const rt = st.rt.get(key);
    if (!rt) continue;
    const pts: LivePt[] = t.pts.map(([i, a, d]) => {
      const r = rt.get(i);
      const ev = (plan: number | null, e?: Ev) =>
        plan === null
          ? undefined
          : { plan, ...(e?.rt !== undefined ? { rt: plan + (e.rt - e.plan) } : {}) };
      const arr = ev(a, r?.arr);
      const dep = ev(d, r?.dep);
      return {
        i,
        ...(arr ? { arr } : {}),
        ...(dep ? { dep } : {}),
        ...(r?.cancelled ? { cancelled: true } : {}),
      };
    });
    const run = finish({
      key,
      cat: t.cat,
      nr: t.nr,
      origin: t.origin,
      headsign: t.headsign,
      pts,
      hafasOnly: false,
    });
    if (run) out.set(key, run);
  }
  for (const [key, x] of st.extra) {
    const rt = st.rt.get(key);
    if (!rt || !alongCorridor([...rt.keys()], stations)) continue;
    const time = (s: StationRt) => s.arr?.plan ?? s.dep?.plan ?? 0;
    const pts: LivePt[] = [...rt]
      .sort((a, b) => time(a[1]) - time(b[1]))
      .map(([i, s]) => ({ i, ...s }));
    const run = finish({
      key,
      cat: x.cat,
      nr: x.nr,
      origin: "",
      headsign: x.headsign,
      pts,
      hafasOnly: true,
    });
    if (run) out.set(key, run);
  }
  return out;
}

/** One round: boards (only when the window changed) and the radar. Mutates `st`. */
export async function refreshLive(o: {
  client: LiveClient;
  st: LiveState;
  day: string;
  nowMin: number;
  /** visible window, minutes */
  t0: number;
  t1: number;
  stations: CorridorStation[];
  /** station indices of the shown section */
  lo: number;
  hi: number;
  /** bounding box of the section's stations (for the radar) */
  bbox?: { north: number; south: number; west: number; east: number };
  /** GTFS trains of the day */
  trains: CorridorTrain[];
  /** called after each request (draw progressively) */
  onProgress?: () => void;
}): Promise<void> {
  const { client, st, day, nowMin, stations, lo, hi } = o;
  const gtfs = new Set(o.trains.map((t) => trainKey(t.cat, t.nr)));
  const idx = new Map<string, number>();
  stations.forEach((s, i) => s.hafasId && i >= lo && i <= hi && idx.set(s.hafasId, i));
  const at = (m: number) =>
    Temporal.PlainDate.from(day)
      .toZonedDateTime({ timeZone: VIENNA })
      .add({ minutes: Math.round(m) });
  const note = (k: string, line: Line, headsign: string) => {
    // a line number instead of a train number ("CJX 5", "S 2"): can't be matched, don't draw twice
    if (!line.trainNumber && /^\d{1,2}$/.test(line.number)) return;
    if (!gtfs.has(k) && !st.extra.has(k))
      st.extra.set(k, {
        cat: normCat(line.category),
        nr: line.trainNumber ?? line.number,
        headsign,
      });
  };

  // 1. boards at the major stations (+ arrivals at the section ends), once per window: the past
  const tag = `${lo}-${hi}@${o.t0}-${o.t1}`;
  const until = Math.min(o.t1, nowMin + 60);
  if (st.boardsFor !== tag && until > o.t0) {
    st.boardsFor = tag;
    const boards: { i: number; arrivals: boolean }[] = stations
      .map((s, i) => ({ s, i }))
      .filter(({ s, i }) => i >= lo && i <= hi && s.hafasId && (s.major || i === lo || i === hi))
      .map(({ i }) => ({ i, arrivals: false }));
    for (const i of [lo, hi]) if (stations[i]?.hafasId) boards.push({ i, arrivals: true });
    await pool(boards, 2, async ({ i, arrivals }) => {
      // time range of the window's trains at this station (a train visible in the window may
      // pass this station before or after it)
      const ts = o.trains.flatMap((t) => {
        const p = t.pts.find(([j]) => j === i);
        const v = p && (arrivals ? p[1] : p[2]);
        if (v === null || v === undefined) return [];
        const ms = t.pts
          .flatMap(([j, a, d]) => (j >= lo && j <= hi ? [a, d] : []))
          .filter((x) => x !== null);
        return Math.min(...ms) <= until && Math.max(...ms) >= o.t0 ? [v] : [];
      });
      const from = Math.max(0, (ts.length ? Math.min(...ts) : o.t0) - 5);
      const to = Math.min(until, (ts.length ? Math.max(...ts) : until) + 5);
      // pages of up to 200 trains (a big station's board lists every line)
      for (let start = from, page = 0; start < to && page < 4; page++) {
        const b = await client.board(stations[i]!.hafasId!, {
          when: at(start),
          duration: Math.max(5, Math.round(to - start)),
          results: 200,
          products: RAIL_PRODUCTS & ~2, // no rail replacement buses
          ...(arrivals ? { arrivals: true } : {}),
        });
        for (const e of b) {
          const k = lineKey(e.line);
          addEvent(st, k, i, arrivals ? "arr" : "dep", e.when, day, e.cancelled);
          note(k, e.line, e.direction);
        }
        o.onProgress?.();
        if (b.length < 200) break;
        start = minutesOn(day, b.at(-1)!.when.planned) + 1;
      }
    });
  }

  // 2. radar: running trains, realtime of the stops around their position (also minor stations)
  if (o.bbox) {
    const ms = await client.radar(o.bbox, { results: 400, products: RAIL_PRODUCTS & ~2 });
    for (const m of ms) {
      const k = lineKey(m.line);
      for (const so of m.nextStops) {
        const i = idx.get(so.stop.id);
        if (i === undefined) continue;
        addEvent(st, k, i, "arr", so.arr, day, so.cancelled);
        addEvent(st, k, i, "dep", so.dep, day, so.cancelled);
        note(k, m.line, m.direction);
      }
    }
    o.onProgress?.();
  }
}

/** how many stations have reported times, and the last report up to now (station, minute, delay) */
export function lastReported(r: LiveRun, nowMin: number) {
  let best: { i: number; rt: number; delay: number } | undefined;
  let n = 0;
  for (const p of r.pts) {
    if (p.arr?.rt !== undefined || p.dep?.rt !== undefined) n++;
    for (const e of [p.arr, p.dep])
      if (e?.rt !== undefined && e.rt <= nowMin + 1 && (!best || e.rt >= best.rt))
        best = { i: p.i, rt: e.rt, delay: e.rt - e.plan };
  }
  return { stations: n, last: best };
}
