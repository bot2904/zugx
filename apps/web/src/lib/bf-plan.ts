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
