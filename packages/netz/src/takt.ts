/**
 * Takt (periodic interval) detection.
 *
 * Input: departure times (minutes since midnight) of a group of trips at a
 * common reference node. For each candidate headway T (15, 30, 60, 120) we find
 * the phase p (minute mod T) matched by most departures within ±tol minutes,
 * then count the filled "slots" (p + k·T) between the first and last matching
 * departure inside the main operating window (default 06:00–20:00). The
 * smallest T whose slots are ≥ 75 % filled (and with enough trips) wins.
 */
import type { Frequency } from "./types.ts";

export const TAKTS = [15, 30, 60, 120] as const;

export interface TaktOptions {
  /** window start, minutes since midnight (default 06:00) */
  from?: number;
  /** window end (default 20:00) */
  to?: number;
  /** tolerance in minutes around the phase (default 3) */
  tol?: number;
  /** minimal share of filled slots (default 0.75) */
  minFill?: number;
}

export interface TaktResult {
  takt: Frequency;
  /** phase: representative minute mod takt (or of the first departure if takt is null) */
  phase: number;
  /** indices (into the input) of the departures belonging to this Takt family */
  members: number[];
}

/** a mod m, always in [0, m) */
export const mod = (a: number, m: number) => ((a % m) + m) % m;

/** circular distance of a and b modulo m */
export const circDist = (a: number, b: number, m: number) => {
  const d = mod(a - b, m);
  return Math.min(d, m - d);
};

/** Circular median: the input residue minimising the sum of circular distances. */
export function circMedian(values: number[], m: number): number {
  let best = values[0] ?? 0;
  let bestCost = Infinity;
  for (const c of values) {
    let cost = 0;
    for (const v of values) cost += circDist(v, c, m);
    if (cost < bestCost) {
      bestCost = cost;
      best = c;
    }
  }
  return mod(best, m);
}

/** Tries one headway; returns phase, member indices and slot fill ratio. */
export function fitTakt(times: number[], T: number, opts: TaktOptions = {}) {
  const { from = 360, to = 1200, tol = 3 } = opts;
  const inWin = times.map((t, i) => [t, i] as const).filter(([t]) => t >= from && t <= to);
  let phase = 0;
  let bestCount = -1;
  for (let p = 0; p < T; p++) {
    let count = 0;
    for (const [t] of inWin) if (circDist(t, p, T) <= tol) count++;
    if (count > bestCount) {
      bestCount = count;
      phase = p;
    }
  }
  // refine: median of matching residues
  const residues = inWin.filter(([t]) => circDist(t, phase, T) <= tol).map(([t]) => mod(t, T));
  if (residues.length) phase = circMedian(residues, T);
  const members: number[] = [];
  times.forEach((t, i) => {
    if (circDist(t, phase, T) <= tol) members.push(i);
  });
  const slots = new Set<number>();
  for (const [t] of inWin) {
    if (circDist(t, phase, T) <= tol) slots.add(Math.round((t - phase) / T));
  }
  const ks = [...slots];
  const expected = ks.length ? Math.max(...ks) - Math.min(...ks) + 1 : 0;
  return { phase, members, filled: slots.size, fill: expected ? slots.size / expected : 0 };
}

/** Detects the Takt of one family of departures (see module doc). */
export function detectTakt(times: number[], opts: TaktOptions = {}): TaktResult {
  const minFill = opts.minFill ?? 0.75;
  for (const T of TAKTS) {
    const fit = fitTakt(times, T, opts);
    // 15'/30' need a longer run of consecutive slots to be convincing
    const minSlots = T <= 30 ? 5 : 3;
    if (fit.filled >= minSlots && fit.fill >= minFill) {
      return { takt: T, phase: fit.phase, members: fit.members };
    }
  }
  const first = times.length ? Math.min(...times) : 0;
  return { takt: null, phase: mod(first, 60), members: times.map((_, i) => i) };
}

/**
 * Splits departures into Takt families: detect the best Takt, remove its
 * members, repeat on the rest. Leftovers without a Takt form a final family
 * with `takt: null`.
 */
export function taktFamilies(times: number[], opts: TaktOptions = {}): TaktResult[] {
  const out: TaktResult[] = [];
  let rest = times.map((_, i) => i);
  while (rest.length > 0) {
    const sub = rest.map((i) => times[i]!);
    const r = detectTakt(sub, opts);
    const members = r.members.map((j) => rest[j]!);
    out.push({ ...r, members });
    if (r.takt === null) break;
    const taken = new Set(members);
    rest = rest.filter((i) => !taken.has(i));
  }
  return out;
}
