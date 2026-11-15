// Bildfahrplan planning analyses (PLAN.md "Bildfahrplan as a planning tool"): transfers and
// Taktknoten at a station. Pure functions over the corridor trains of one day.
import type { CorridorTrain } from "@zugx/netz";

/**
 * passing points carry interpolated times with one decimal and arrival = departure (see
 * passingPoints in @zugx/netz); stops have whole minutes
 */
export const isPass = (a: number | null, d: number | null) => a !== null && a === d && a % 1 !== 0;

/** a train stopping at a station: arrival (null where it starts), departure (null where it ends) */
export interface Stop {
  t: CorridorTrain;
  a: number | null;
  d: number | null;
}
export function stopsAt(trains: CorridorTrain[], i: number): Stop[] {
  const out: Stop[] = [];
  for (const t of trains)
    for (const [j, a, d] of t.pts)
      if (j === i && !isPass(a, d) && (a !== null || d !== null)) out.push({ t, a, d });
  return out;
}

// ---- 1. transfers ----

export interface Transfer {
  t: CorridorTrain;
  d: number;
  /** transfer time in minutes */
  wait: number;
}
export interface ArrivalConnections {
  arr: Stop & { a: number };
  /** per direction (1 = corridor order, -1 = reverse) */
  dirs: {
    dir: 1 | -1;
    /** the arriving train itself continues in this direction */
    continues: boolean;
    /** first departure of another train reachable with the minimum transfer time */
    next?: Transfer;
    /** last departure missed by at most `nearMiss` minutes: `short` = minutes too short */
    missed?: Transfer & { short: number };
  }[];
}

/**
 * For every train arriving at station `i` in [t0, t1): the first connection per direction with
 * at least `minTransfer` minutes, and a near miss (departure just before that).
 */
export function connections(
  trains: CorridorTrain[],
  i: number,
  t0: number,
  t1: number,
  minTransfer = 3,
  maxWait = 90,
  nearMiss = 5,
): ArrivalConnections[] {
  const stops = stopsAt(trains, i);
  const deps = stops
    .filter((s): s is Stop & { d: number } => s.d !== null)
    .sort((x, y) => x.d - y.d);
  return stops
    .filter((s): s is Stop & { a: number } => s.a !== null && s.a >= t0 && s.a < t1)
    .sort((x, y) => x.a - y.a)
    .map((arr) => ({
      arr,
      dirs: ([1, -1] as const).map((dir) => {
        const continues = arr.d !== null && arr.t.dir === dir;
        const cands = deps.filter((s) => s.t !== arr.t && s.t.dir === dir);
        const n = cands.find((s) => s.d >= arr.a + minTransfer && s.d <= arr.a + maxWait);
        const m = cands.findLast(
          (s) => s.d < arr.a + minTransfer && s.d >= arr.a + minTransfer - nearMiss,
        );
        return {
          dir,
          continues,
          ...(n ? { next: { t: n.t, d: n.d, wait: n.d - arr.a } } : {}),
          ...(m
            ? {
                missed: {
                  t: m.t,
                  d: m.d,
                  wait: m.d - arr.a,
                  short: Math.round(arr.a + minTransfer - m.d),
                },
              }
            : {}),
        };
      }),
    }));
}

/** colour class of a transfer time: short (≤ 10′), medium (≤ 20′), long */
export const waitClass = (w: number) => (w <= 10 ? "good" : w <= 20 ? "mid" : "bad");

// ---- 2. Taktknoten ----

const mod60 = (m: number) => ((Math.round(m) % 60) + 60) % 60;

/** a line at the station: category, direction, destination, with its typical minutes */
export interface LineAtNode {
  cat: string;
  dir: 1 | -1;
  to: string;
  /** trains of the line stopping here on the day */
  n: number;
  /** most frequent arrival / departure minute of the hour (null: starts / ends here) */
  arrMin: number | null;
  depMin: number | null;
  /** share of the trains on these minutes (±1′): 1 = strict Takt */
  regular: number;
  /** most frequent headway in minutes (60, 30, 120 …), null for single trains */
  headway: number | null;
}

/** most frequent value (±1 tolerance) and its share */
function mode(xs: number[], wrap = 60): { v: number; share: number } | undefined {
  if (!xs.length) return undefined;
  let best = { v: xs[0]!, n: 0 };
  for (const x of xs) {
    const n = xs.filter((y) => Math.min(Math.abs(x - y), wrap - Math.abs(x - y)) <= 1).length;
    if (n > best.n) best = { v: x, n };
  }
  return { v: best.v, share: best.n / xs.length };
}

export function linesAtNode(trains: CorridorTrain[], i: number): LineAtNode[] {
  const groups = new Map<string, Stop[]>();
  for (const s of stopsAt(trains, i)) {
    const k = `${s.t.cat}|${s.t.dir}|${s.t.headsign}`;
    const list = groups.get(k) ?? [];
    list.push(s);
    groups.set(k, list);
  }
  const out: LineAtNode[] = [];
  for (const [k, list] of groups) {
    const [cat, dir, to] = k.split("|") as [string, string, string];
    const arr = mode(list.flatMap((s) => (s.a !== null ? [mod60(s.a)] : [])));
    const dep = mode(list.flatMap((s) => (s.d !== null ? [mod60(s.d)] : [])));
    const times = list
      .map((s) => s.d ?? s.a!)
      .sort((x, y) => x - y)
      .map(Math.round);
    const gaps = times.slice(1).map((t, j) => t - times[j]!);
    const hw = mode(gaps, Infinity);
    out.push({
      cat,
      dir: Number(dir) as 1 | -1,
      to,
      n: list.length,
      arrMin: arr?.v ?? null,
      depMin: dep?.v ?? null,
      regular: Math.min(arr?.share ?? 1, dep?.share ?? 1),
      headway: hw && hw.share >= 0.4 ? hw.v : null,
    });
  }
  return out.sort((x, y) => y.n - x.n);
}

export interface NodeVerdict {
  /** node minute (0, 15, 30, 45) where most lines meet, or undefined */
  minute?: number;
  /** lines arriving shortly before and departing shortly after that minute */
  meeting: number;
  /** lines considered (≥ 3 trains, regular) */
  lines: number;
  /** symmetry minute per category with both directions (European standard ≈ :00 / :30) */
  symmetry: { cat: string; minute: number }[];
}

/**
 * Taktknoten: the quarter hour around which the regular lines meet — arriving within 10′ before,
 * departing within 10′ after (a Vollknoten at :00, a Halbknoten at :30). Symmetry minute per
 * category: half the sum of one direction's departure and the other direction's arrival.
 */
export function nodeVerdict(lines: LineAtNode[]): NodeVerdict {
  const reg = lines.filter((l) => l.n >= 3 && l.regular >= 0.5);
  const meets = (l: LineAtNode, m: number) => {
    const before = (x: number | null) => x === null || mod60(m - x) <= 10;
    const after = (x: number | null) => x === null || mod60(x - m) <= 10;
    return before(l.arrMin) && after(l.depMin) && (l.arrMin !== null || l.depMin !== null);
  };
  let best: { m: number; n: number } = { m: 0, n: 0 };
  for (const m of [0, 15, 30, 45]) {
    const n = reg.filter((l) => meets(l, m)).length;
    if (n > best.n) best = { m, n };
  }
  const symmetry: { cat: string; minute: number }[] = [];
  for (const cat of new Set(reg.map((l) => l.cat))) {
    const up = reg.find((l) => l.cat === cat && l.dir === 1 && l.depMin !== null);
    const down = reg.find((l) => l.cat === cat && l.dir === -1 && l.arrMin !== null);
    if (!up || !down) continue;
    // t_dep(→) + t_arr(←) ≡ 2·s (mod 60): two solutions 30′ apart, report the one in [0, 30)
    const s = ((((up.depMin! + down.arrMin!) / 2) % 30) + 30) % 30;
    symmetry.push({ cat, minute: Math.round(s * 10) / 10 });
  }
  return {
    ...(best.n >= 2 ? { minute: best.m } : {}),
    meeting: best.n,
    lines: reg.length,
    symmetry,
  };
}

// ---- 4./5. crossings on single track ----

/** [km from, km to, tracks] along the corridor (Corridor.tracks) */
export type TrackRuns = [number, number, number][];

/** single track somewhere on the stretch between two km (≥ 300 m), false if double, undefined unknown */
export function singleTrack(tracks: TrackRuns, k1: number, k2: number): boolean | undefined {
  const [lo, hi] = k1 < k2 ? [k1, k2] : [k2, k1];
  let known = 0;
  let single = false;
  for (const [a, b, n] of tracks) {
    const len = Math.min(b, hi) - Math.max(a, lo);
    if (len <= 0) continue;
    known += len;
    if (n === 1 && len >= 0.3) single = true;
  }
  if (single) return true;
  return known >= (hi - lo) * 0.5 ? false : undefined;
}

export interface Crossing {
  /** train in corridor order (dir 1) and against it (dir −1) */
  up: CorridorTrain;
  down: CorridorTrain;
  /** station index where they cross; for a meeting on the line: the stretch [i, i2] */
  i: number;
  i2?: number;
  km: number;
  /** time of the meeting (station: when both are there; line: intersection) */
  time: number;
  /**
   * buffers in minutes, at a station crossing on single track: how late the other train may be
   * before this one has to wait (undefined where the stretch it enters is double track)
   */
  bufUp?: number;
  bufDown?: number;
  /** meeting on a single-track stretch between stations: impossible as planned */
  conflict: boolean;
}

interface At {
  km: number;
  a: number;
  d: number;
}
function pointsOf(t: CorridorTrain, km: (i: number) => number): Map<number, At> {
  const m = new Map<number, At>();
  for (const [i, a, d] of t.pts) {
    if (a === null && d === null) continue;
    m.set(i, { km: km(i), a: (a ?? d)!, d: (d ?? a)! });
  }
  return m;
}

/**
 * Where trains of opposite directions meet, on stretches with single track next to them:
 * crossings at stations (both there at the same time) with the buffer each way, and meetings
 * between stations on single track (conflicts). Only trains meeting in [t0, t1).
 */
export function crossings(
  trains: CorridorTrain[],
  stationKm: number[],
  tracks: TrackRuns,
  t0: number,
  t1: number,
): Crossing[] {
  const km = (i: number) => stationKm[i] ?? 0;
  const ups = trains.filter((t) => t.dir === 1).map((t) => ({ t, p: pointsOf(t, km) }));
  const downs = trains.filter((t) => t.dir === -1).map((t) => ({ t, p: pointsOf(t, km) }));
  const span = (p: Map<number, At>) => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const x of p.values()) [lo, hi] = [Math.min(lo, x.a), Math.max(hi, x.d)];
    return [lo, hi] as const;
  };
  const out: Crossing[] = [];
  for (const U of ups) {
    const [ul, uh] = span(U.p);
    if (uh < t0 - 60 || ul > t1 + 60) continue;
    for (const D of downs) {
      const [dl, dh] = span(D.p);
      if (dh < ul || dl > uh) continue;
      // stations both trains have a time at, in km order
      const common = [...U.p.keys()].filter((i) => D.p.has(i)).sort((x, y) => km(x) - km(y));
      for (let k = 0; k < common.length; k++) {
        const i = common[k]!;
        const u = U.p.get(i)!;
        const d = D.p.get(i)!;
        // both at the station at the same time
        if (Math.max(u.a, d.a) <= Math.min(u.d, d.d)) {
          const next = common[k + 1];
          const prev = common[k - 1];
          // the up train enters the stretch towards `next`, the down train came from there
          const sUp = next !== undefined ? singleTrack(tracks, km(i), km(next)) : undefined;
          const sDown = prev !== undefined ? singleTrack(tracks, km(prev), km(i)) : undefined;
          if (!sUp && !sDown) break;
          const time = Math.max(u.a, d.a);
          if (time >= t0 && time < t1)
            out.push({
              up: U.t,
              down: D.t,
              i,
              km: km(i),
              time,
              ...(sUp ? { bufUp: Math.round(u.d - d.a) } : {}),
              ...(sDown ? { bufDown: Math.round(d.d - u.a) } : {}),
              conflict: false,
            });
          break;
        }
        // meeting on the line between i and the next common station
        const i2 = common[k + 1];
        if (i2 === undefined) break;
        const u2 = U.p.get(i2)!;
        const d2 = D.p.get(i2)!;
        if (u.d < d.a && d2.d < u2.a) {
          // intersection of up (km(i), u.d) → (km(i2), u2.a) and down (km(i2), d2.d) → (km(i), d.a)
          const L = km(i2) - km(i) || 1e-6;
          const su = (u2.a - u.d) / L;
          const sd = (d.a - d2.d) / L; // time per km going down
          const x = (d.a - u.d) / (su + sd); // km from station i
          const time = u.d + su * x;
          const single = singleTrack(tracks, km(i), km(i2));
          if (single && time >= t0 && time < t1)
            out.push({ up: U.t, down: D.t, i, i2, km: km(i) + x, time, conflict: true });
          break;
        }
      }
    }
  }
  return out.sort((a, b) => a.time - b.time);
}

/** colour class of a crossing buffer: fragile (≤ 2′), tight (≤ 5′), comfortable */
export const bufferClass = (b: number) => (b <= 2 ? "bad" : b <= 5 ? "mid" : "good");
