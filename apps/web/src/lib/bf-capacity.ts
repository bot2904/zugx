// Capacity (planning panel "Kapazität"): blocking times per block section — the
// Sperrzeitentreppe of the timetable. Block sections run from main signal to main signal (OSM,
// per direction); where a stretch has no signal data, the stations are the block boundaries.
//
// Blocking time of a train in a block (simplified after the blocking-time theory, e.g. Pachl,
// "Systemtechnik des Schienenverkehrs"):
//   start = when the train passes the distant signal of the block's entry signal (approach
//           distance before the block), minus route setting + sight/reaction time; for a train
//           standing at a station before the block: its departure minus that time
//   end   = when the train's tail has cleared the block's exit signal (exit + train length),
//           plus release time
// Two trains in the same block at the same time = conflict; on single track also trains of
// opposite directions on the same stretch between stations.
import type { Corridor, CorridorTrain } from "@zugx/netz";
import { singleTrack, type TrackRuns } from "./bf-plan.ts";

/** adjustable assumptions (kept in the browser) */
export interface BlockParams {
  /** distance distant → main signal = approach distance, m (PZB: 1000 m, also 700 m) */
  approach: number;
  /** route setting + sight and reaction time, minutes */
  setup: number;
  /** release time after clearing, minutes */
  release: number;
  /** train length, m: multiple units (S, R, REX, CJX) and locomotive-hauled trains */
  lengthMU: number;
  lengthLoco: number;
  /** overlaps up to this many minutes are not conflicts (timetable minutes are rounded) */
  tolerance: number;
}
export const BLOCK_DEFAULTS: BlockParams = {
  approach: 1000,
  setup: 0.4,
  release: 0.1,
  lengthMU: 150,
  lengthLoco: 400,
  tolerance: 0.5,
};
const MU = new Set(["S", "R", "REX", "CJX"]);

/** block boundaries (corridor km, travel order) for direction `dir` within [lo, hi] km */
export function blockBounds(
  blocks: NonNullable<Corridor["blocks"]> | undefined,
  stationKm: number[],
  lo: number,
  hi: number,
  dir: 1 | -1,
): number[] {
  const sig = blocks ? (dir === 1 ? blocks.up : blocks.down) : [];
  // stations next to a stretch without signals of this direction (no data, or missing in OSM):
  // block boundary at the station
  const bare = (a: number, b: number) => !sig.some((x) => x > a + 0.01 && x < b - 0.01);
  const fallback = stationKm.filter((km, k) => {
    const prev = stationKm[k - 1];
    const next = stationKm[k + 1];
    return (prev !== undefined && bare(prev, km)) || (next !== undefined && bare(km, next));
  });
  const all = [...new Set([lo, hi, ...sig, ...fallback].filter((km) => km >= lo && km <= hi))];
  all.sort((a, b) => a - b);
  return dir === 1 ? all : all.reverse();
}

/** a train's position over time: [km, arrival, departure] in travel order */
type Run = [number, number, number][];
function runOf(t: CorridorTrain, stationKm: number[]): Run {
  const r: Run = [];
  for (const [i, a, d] of t.pts) {
    const km = stationKm[i];
    if (km === undefined || (a === null && d === null)) continue;
    r.push([km, (a ?? d)!, (d ?? a)!]);
  }
  return r;
}
/** time the train's head reaches `km` (undefined outside its run); at a stop: the arrival */
function headAt(r: Run, km: number, dir: 1 | -1): number | undefined {
  for (let j = 0; j < r.length; j++) {
    const [k, a] = r[j]!;
    if (Math.abs(k - km) < 1e-6) return a;
    const nx = r[j + 1];
    if (!nx) break;
    const [k2, a2] = nx;
    if ((km - k) * dir > 0 && (k2 - km) * dir > 0) {
      const d = r[j]![2];
      return d + ((a2 - d) * (km - k)) / (k2 - k);
    }
  }
  return undefined;
}

export interface BlockBox {
  t: CorridorTrain;
  dir: 1 | -1;
  /** another line than the sheet's (CorridorTrain.via): its own tracks and blocks, e.g. "330-01" */
  res?: string;
  /** block index in travel order of `dir`, and its km range */
  block: number;
  from: number;
  to: number;
  start: number;
  end: number;
  conflict?: boolean;
}

/** blocking times of one train in all blocks it runs through (bounds in its travel order) */
export function blockingTimes(
  t: CorridorTrain,
  stationKm: number[],
  bounds: number[],
  p: BlockParams = BLOCK_DEFAULTS,
): BlockBox[] {
  const dir = t.dir;
  const r = runOf(t, stationKm);
  if (r.length < 2) return [];
  const first = r[0]![0];
  const last = r.at(-1)![0];
  const len = (MU.has(t.cat) ? p.lengthMU : p.lengthLoco) / 1000;
  const app = p.approach / 1000;
  const inRun = (km: number) => (km - first) * dir >= -1e-6 && (last - km) * dir >= -1e-6;
  const out: BlockBox[] = [];
  for (let b = 0; b + 1 < bounds.length; b++) {
    const x0 = bounds[b]!;
    const x1 = bounds[b + 1]!;
    // the train's run must cover part of the block
    if ((x1 - first) * dir <= 0 || (last - x0) * dir <= 0) continue;
    // start: approach (distant signal) or the departure of a stop before the block entry
    const xa = x0 - dir * app;
    let start: number | undefined;
    // (its origin counts as a stop: it stands there until departure)
    const stopBefore = r.findLast(
      ([k, a, d], j) => (d > a || j === 0) && (k - xa) * dir >= 0 && (x0 - k) * dir >= -1e-6,
    );
    if (stopBefore) start = stopBefore[2];
    else if (inRun(xa)) start = headAt(r, xa, dir);
    else if ((first - x0) * dir >= -1e-6) start = r[0]![2]; // starts in or right before the block
    else start = headAt(r, x0, dir);
    // end: tail clears the exit signal, or the train ends before that
    const xc = x1 + dir * len;
    const end = inRun(xc) ? headAt(r, xc, dir) : r.at(-1)![1];
    if (start === undefined || end === undefined) continue;
    out.push({
      t,
      dir,
      block: b,
      from: Math.min(x0, x1),
      to: Math.max(x0, x1),
      start: start - p.setup,
      end: end + p.release,
    });
  }
  return out;
}

/**
 * Station pairs without any signal data (e.g. Salzburg – Kufstein through Germany, outside the
 * Austrian OSM extract): no block model there — a box entirely inside such a stretch is dropped
 * instead of one huge station-to-station block.
 */
export function withoutUnknown(
  boxes: BlockBox[],
  blocks: NonNullable<Corridor["blocks"]> | undefined,
  stationKm: number[],
): BlockBox[] {
  const known = blocks?.known ?? [];
  const unknown: [number, number][] = [];
  for (let k = 1; k < stationKm.length; k++) {
    const [a, b] = [stationKm[k - 1]!, stationKm[k]!];
    if (b > a && !known.some(([x, y]) => x <= a + 0.01 && y >= b - 0.01)) unknown.push([a, b]);
  }
  return boxes.filter(
    (x) => x.res || !unknown.some(([a, b]) => x.from >= a - 0.01 && x.to <= b + 0.01),
  );
}

type AltBlocks = NonNullable<NonNullable<Corridor["blocks"]>["alt"]>;

/**
 * Blocking times of a train in the shown section [lo, hi]: on the sheet's own line `bounds`; on
 * stretches where it takes another line (`t.via`, e.g. the new Unterinntal line in the tunnel)
 * that line's blocks (`alt`) as a separate resource — trains there don't conflict with those on
 * the old line.
 */
export function trainBlocks(
  t: CorridorTrain,
  stationKm: number[],
  bounds: number[],
  alt: AltBlocks,
  lo: number,
  hi: number,
  p: BlockParams = BLOCK_DEFAULTS,
): BlockBox[] {
  const all = blockingTimes(t, stationKm, bounds, p);
  if (!t.via?.length) return all;
  const via = t.via.flatMap(([vi, vj, line]) => {
    const [i, j] = vi < vj ? [vi, vj] : [vj, vi];
    const from = Math.max(lo, stationKm[i] ?? 0);
    const to = Math.min(hi, stationKm[j] ?? 0);
    return to > from ? [{ i, j, line, from, to }] : [];
  });
  const inVia = (b: BlockBox) => via.some((v) => b.from >= v.from - 0.01 && b.to <= v.to + 0.01);
  const out = all.filter((b) => !inVia(b));
  for (const v of via) {
    const a =
      alt.find((x) => x.line === v.line && x.i === v.i && x.j === v.j) ??
      alt.find((x) => x.line === v.line && x.i <= v.i && x.j >= v.j);
    const sig = (a ? (t.dir === 1 ? a.up : a.down) : []).filter((k) => k > v.from && k < v.to);
    const b = [v.from, ...sig, v.to];
    if (t.dir === -1) b.reverse();
    for (const x of blockingTimes(t, stationKm, b, p))
      if (x.from >= v.from - 0.01 && x.to <= v.to + 0.01) out.push({ ...x, res: v.line });
  }
  return out;
}

/**
 * Coupled trains (portions running together, e.g. RJX 260 + RJX 660) have identical blocking
 * times: one box per block and time, the first train stands for both.
 */
export function mergeCoupled(boxes: BlockBox[]): BlockBox[] {
  const seen = new Set<string>();
  return boxes.filter((x) => {
    const k = `${x.res ?? ""}|${x.dir}|${x.block}|${Math.round(x.start * 5)}|${Math.round(x.end * 5)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Marks conflicts: overlapping blocking times of two trains in the same block (same direction),
 * and on single track (outside stations) of trains of opposite directions on overlapping km.
 */
export function markConflicts(
  boxes: BlockBox[],
  tracks: TrackRuns,
  /** stations and other crossing places (passing loops) */
  stationKm: number[],
  tolerance = 0,
) {
  const byBlock = new Map<string, BlockBox[]>();
  for (const x of boxes) {
    const k = `${x.res ?? ""}|${x.dir}|${x.block}`;
    byBlock.set(k, [...(byBlock.get(k) ?? []), x]);
  }
  for (const list of byBlock.values()) {
    list.sort((a, b) => a.start - b.start);
    for (let i = 1; i < list.length; i++)
      for (let j = i - 1; j >= 0 && j >= i - 3; j--)
        if (list[j]!.t !== list[i]!.t && list[j]!.end - list[i]!.start > tolerance)
          list[i]!.conflict = list[j]!.conflict = true;
  }
  if (!tracks.length) return;
  const ups = boxes.filter((x) => x.dir === 1);
  const downs = boxes.filter((x) => x.dir === -1);
  for (const u of ups)
    for (const d of downs) {
      const a = Math.max(u.from, d.from);
      const b = Math.min(u.to, d.to);
      if (u.res !== d.res) continue; // different tracks
      if (b - a < 0.05 || u.end - d.start <= tolerance || d.end - u.start <= tolerance) continue;
      // overlapping within a station's limits (its entry signals, up to ~1 km from the
      // platforms): they cross there on separate tracks (passing loop)
      if (stationKm.some((km) => a >= km - 1 && b <= km + 1)) continue;
      if (singleTrack(tracks, a, b)) u.conflict = d.conflict = true;
    }
}

export interface BlockRow {
  dir: 1 | -1;
  /** another line (separate tracks), see BlockBox.res */
  res?: string;
  block: number;
  from: number;
  to: number;
  /** trains with a blocking time in the window */
  n: number;
  /** share of the window the block is blocked (union of the blocking times) */
  occupancy: number;
  /** longest blocking time (≈ minimum headway behind a train of that kind), minutes */
  maxBlock: number;
  conflicts: number;
}

/** per block: trains, occupancy in [t0, t1], longest blocking time, conflicts */
export function blockTable(boxes: BlockBox[], t0: number, t1: number): BlockRow[] {
  const m = new Map<string, BlockBox[]>();
  for (const x of boxes) {
    const k = `${x.res ?? ""}|${x.dir}|${x.block}`;
    m.set(k, [...(m.get(k) ?? []), x]);
  }
  const rows: BlockRow[] = [];
  for (const list of m.values()) {
    const iv = list
      .map((x) => [Math.max(t0, x.start), Math.min(t1, x.end)] as const)
      .filter(([a, b]) => b > a)
      .sort((a, b) => a[0] - b[0]);
    let busy = 0;
    let cur: [number, number] | undefined;
    for (const [a, b] of iv) {
      if (cur && a <= cur[1]) cur[1] = Math.max(cur[1], b);
      else {
        if (cur) busy += cur[1] - cur[0];
        cur = [a, b];
      }
    }
    if (cur) busy += cur[1] - cur[0];
    const f = list[0]!;
    rows.push({
      dir: f.dir,
      ...(f.res ? { res: f.res } : {}),
      block: f.block,
      from: f.from,
      to: f.to,
      n: new Set(list.filter((x) => x.end > t0 && x.start < t1).map((x) => x.t)).size,
      occupancy: busy / Math.max(1, t1 - t0),
      maxBlock: Math.max(...list.map((x) => x.end - x.start)),
      conflicts: list.filter((x) => x.conflict).length,
    });
  }
  // in travel order along the km axis; another line's blocks among them by position
  return rows.sort(
    (a, b) => a.dir - b.dir || (a.from - b.from) * a.dir || (a.res ? 1 : 0) - (b.res ? 1 : 0),
  );
}

/** occupancy colour after UIC 406 (mixed traffic): ≤ 60 % fine, ≤ 75 % tight, above congested */
export const occupancyClass = (o: number) => (o > 0.75 ? "bad" : o > 0.6 ? "mid" : "good");
