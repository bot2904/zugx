/**
 * GTFS trips → Netzgrafik model (line patterns with Takt, node minutes,
 * travel times, edges, Knotenzeiten).
 */
import { haversineKm, type Feed, type Station, type Trip } from "./gtfs.ts";
import type { NodeDef } from "./nodes.ts";
import { circDist, circMedian, mod, taktFamilies, type TaktOptions } from "./takt.ts";
import type {
  TrainrunDirection,
  TrainrunStop,
  NetzEdge,
  Trainrun,
  NetzModel,
  NetzNode,
  NodeTimes,
  Frequency,
} from "./types.ts";

export interface NetzOptions {
  day: string;
  source: string;
  cats: string[];
  nodes: NodeDef[];
  /** DHID → HAFAS id (optional) */
  hafas?: Map<string, string>;
  takt?: TaktOptions;
}

/** A trip projected onto the node graph. */
export interface NodePoint {
  node: string;
  arr: number;
  dep: number;
  /** metres along the trip (NaN if unknown) */
  dist: number;
  pass?: boolean;
}

export interface NodeTrip {
  trip: Trip;
  pts: NodePoint[];
}

const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export const hhmm = (t: number) => {
  const m = mod(Math.round(t), 1440);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

export const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Projects trips onto the node set (keeps only stops at nodes). */
export function projectTrips(trips: Trip[], nodeIds: Set<string>): NodeTrip[] {
  const out: NodeTrip[] = [];
  for (const trip of trips) {
    const pts: NodePoint[] = [];
    for (const s of trip.stops) {
      if (!nodeIds.has(s.st)) continue;
      const last = pts[pts.length - 1];
      if (last?.node === s.st) {
        last.dep = s.dep;
        continue;
      }
      pts.push({ node: s.st, arr: s.arr, dep: s.dep, dist: s.dist });
    }
    if (pts.length >= 2) out.push({ trip, pts });
  }
  return out;
}

/** Median track km per node pair (fallback: 1.2 × haversine). */
export function edgeKm(trips: NodeTrip[], stations: Map<string, { lat: number; lon: number }>) {
  const samples = new Map<string, number[]>();
  for (const { pts } of trips) {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      const k = pairKey(a.node, b.node);
      let arr = samples.get(k);
      if (!arr) samples.set(k, (arr = []));
      const d = (b.dist - a.dist) / 1000;
      if (Number.isFinite(d) && d > 0) arr.push(d);
    }
  }
  const km = new Map<string, number>();
  for (const [k, xs] of samples) {
    let v = median(xs);
    if (!Number.isFinite(v)) {
      const [a, b] = k.split("|") as [string, string];
      const sa = stations.get(a);
      const sb = stations.get(b);
      v = sa && sb ? haversineKm(sa, sb) * 1.2 : NaN;
    }
    if (Number.isFinite(v)) km.set(k, v);
  }
  return km;
}

/**
 * Finds node pairs (A, C) that are served nonstop although a chain of
 * shorter edges A–B–…–C of (almost) the same track length exists: such
 * trains pass B without stopping. Returns pair → intermediate node chain.
 */
export function compositeEdges(km: Map<string, number>, slack = 0.04): Map<string, string[]> {
  const adj = new Map<string, [string, number][]>();
  for (const [k, d] of km) {
    const [a, b] = k.split("|") as [string, string];
    for (const [x, y] of [
      [a, b],
      [b, a],
    ] as const) {
      let l = adj.get(x);
      if (!l) adj.set(x, (l = []));
      l.push([y, d]);
    }
  }
  const out = new Map<string, string[]>();
  for (const [k, direct] of km) {
    const [a, c] = k.split("|") as [string, string];
    // Dijkstra from a to c without the direct edge, bounded by direct·(1+slack)
    const limit = direct * (1 + slack) + 1;
    const dist = new Map<string, number>([[a, 0]]);
    const prev = new Map<string, string>();
    const done = new Set<string>();
    for (;;) {
      let u: string | undefined;
      let best = Infinity;
      for (const [n, d] of dist) {
        if (!done.has(n) && d < best) {
          best = d;
          u = n;
        }
      }
      if (u === undefined || best > limit || u === c) break;
      done.add(u);
      for (const [v, w] of adj.get(u) ?? []) {
        if (u === a && v === c) continue;
        const nd = best + w;
        if (nd < (dist.get(v) ?? Infinity)) {
          dist.set(v, nd);
          prev.set(v, u);
        }
      }
    }
    const dc = dist.get(c);
    if (dc === undefined || dc > limit || dc < direct * (1 - slack) - 1) continue;
    const chain: string[] = [];
    for (let n = prev.get(c); n && n !== a; n = prev.get(n)) chain.unshift(n);
    if (chain.length) out.set(`${a}>${c}`, chain);
    if (chain.length) out.set(`${c}>${a}`, [...chain].reverse());
  }
  return out;
}

/** Inserts interpolated pass-through points for composite hops. */
export function insertPassThroughs(
  trips: NodeTrip[],
  composite: Map<string, string[]>,
  km: Map<string, number>,
) {
  // expand recursively: hops of a chain may be composite themselves
  const expand = (a: string, c: string, depth = 0): string[] => {
    const chain = composite.get(`${a}>${c}`);
    if (!chain || depth > 8) return [];
    const nodes = [a, ...chain, c];
    const out: string[] = [];
    for (let j = 1; j < nodes.length; j++) {
      out.push(...expand(nodes[j - 1]!, nodes[j]!, depth + 1));
      if (j < nodes.length - 1) out.push(nodes[j]!);
    }
    return out;
  };
  for (const t of trips) {
    const pts: NodePoint[] = [t.pts[0]!];
    for (let i = 1; i < t.pts.length; i++) {
      const a = t.pts[i - 1]!;
      const c = t.pts[i]!;
      const chain = expand(a.node, c.node);
      if (chain.length) {
        const nodes = [a.node, ...chain, c.node];
        const legs = nodes.slice(1).map((n, j) => km.get(pairKey(nodes[j]!, n)) ?? 0);
        const total = legs.reduce((s, x) => s + x, 0) || 1;
        let acc = 0;
        chain.forEach((n, j) => {
          acc += legs[j]!;
          const tt = Math.round(a.dep + ((c.arr - a.dep) * acc) / total);
          pts.push({ node: n, arr: tt, dep: tt, dist: a.dist + acc * 1000, pass: true });
        });
      }
      pts.push(c);
    }
    t.pts = pts;
  }
}

interface Group {
  cat: string;
  seq: string[];
  trips: { nt: NodeTrip; offset: number }[];
}

const isSubseq = (inner: string[], outer: string[]) => {
  for (let o = 0; o + inner.length <= outer.length; o++) {
    if (inner.every((n, i) => outer[o + i] === n)) return o;
  }
  return -1;
};

/** Groups trips by (category, node sequence) and merges short-run variants into longer patterns. */
export function groupPatterns(trips: NodeTrip[]): Group[] {
  const groups = new Map<string, Group>();
  for (const nt of trips) {
    const seq = nt.pts.map((p) => p.node);
    const key = `${nt.trip.cat}|${seq.join(">")}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { cat: nt.trip.cat, seq, trips: [] }));
    g.trips.push({ nt, offset: 0 });
  }
  const list = [...groups.values()].sort((a, b) => a.seq.length - b.seq.length);
  const merged = new Set<Group>();
  for (const p of list) {
    let best: { g: Group; off: number } | undefined;
    for (const q of list) {
      if (q === p || merged.has(q) || q.cat !== p.cat || q.seq.length <= p.seq.length) continue;
      const off = isSubseq(p.seq, q.seq);
      if (off < 0) continue;
      // the longer pattern must be a real line, not a one-off
      if (q.trips.length < 2 || q.trips.length < 0.25 * p.trips.length) continue;
      if (!best || q.trips.length > best.g.trips.length) best = { g: q, off };
    }
    if (best) {
      for (const t of p.trips) best.g.trips.push({ nt: t.nt, offset: t.offset + best.off });
      merged.add(p);
    }
  }
  return list.filter((g) => !merged.has(g));
}

/** time of a trip at pattern stop index i (dep, or arr at the last stop) */
const timeAt = (nt: NodeTrip, offset: number, i: number) => {
  const p = nt.pts[i - offset];
  if (!p) return undefined;
  return i - offset === nt.pts.length - 1 ? p.arr : p.dep;
};

interface DirectionDraft {
  cat: string;
  seq: string[];
  takt: Frequency;
  dir: TrainrunDirection;
  members: number;
}

function formatNumbers(cat: string, trips: Trip[]): string {
  const nums = [...new Set(trips.map((t) => t.nr))];
  const numeric = nums.every((n) => /^\d+$/.test(n));
  if (!numeric)
    return `${cat} ${nums.sort().slice(0, 6).join(", ")}${nums.length > 6 ? ", …" : ""}`;
  const sorted = nums.map(Number).sort((a, b) => a - b);
  const runs: [number, number][] = [];
  for (const n of sorted) {
    const last = runs[runs.length - 1];
    if (last && n - last[1] <= 2) last[1] = n;
    else runs.push([n, n]);
  }
  const parts = runs.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`));
  return `${cat} ${parts.slice(0, 5).join(", ")}${parts.length > 5 ? ", …" : ""}`;
}

/** Builds line directions (one per Takt family) from a pattern group. */
export function patternDirections(
  g: Group,
  stationName: (id: string) => string,
  opts?: TaktOptions,
) {
  const n = g.seq.length;
  // reference stop: the one served by most trips (first on ties)
  const cover = g.seq.map(
    (_, i) => g.trips.filter((t) => timeAt(t.nt, t.offset, i) !== undefined).length,
  );
  const ref = cover.indexOf(Math.max(...cover));
  // median time offset of each stop relative to the reference stop
  const rel = g.seq.map((_, i) => {
    const xs: number[] = [];
    for (const t of g.trips) {
      const a = timeAt(t.nt, t.offset, i);
      const r = timeAt(t.nt, t.offset, ref);
      if (a !== undefined && r !== undefined) xs.push(a - r);
    }
    return median(xs);
  });
  const refTimes = g.trips.map((t) => {
    const r = timeAt(t.nt, t.offset, ref);
    if (r !== undefined) return r;
    // partial run: extrapolate from its first served stop
    for (let i = 0; i < n; i++) {
      const a = timeAt(t.nt, t.offset, i);
      if (a !== undefined && Number.isFinite(rel[i]!)) return a - rel[i]!;
    }
    return NaN;
  });
  const fams = taktFamilies(refTimes, opts);
  const hasTakt = fams.some((f) => f.takt !== null);
  const drafts: DirectionDraft[] = [];
  const leftovers = fams.filter((f) => f.takt === null).flatMap((f) => f.members);
  for (const f of fams) {
    if (f.takt === null && hasTakt) continue;
    if (f.takt === null && f.members.length < 2) continue;
    // leftovers (irregular extra trips) count towards the main (first) family
    const all = f === fams[0] && hasTakt ? [...f.members, ...leftovers] : f.members;
    const M = f.takt && f.takt < 60 ? f.takt : 60;
    const members = f.members.map((i) => g.trips[i]!);
    // trim stops not served by any member (families made of partial runs)
    const covered = g.seq.map((_, i) => members.some((t) => t.nt.pts[i - t.offset] !== undefined));
    const lo = covered.indexOf(true);
    const hi = covered.lastIndexOf(true);
    if (lo < 0 || hi <= lo) continue;
    const seq = g.seq.slice(lo, hi + 1);
    // minutes and travel times from through trains if there are any, so that
    // short runs (other dwell / turnaround) do not skew the pattern
    const full = members.filter((t) => t.offset <= lo && t.offset + t.nt.pts.length - 1 >= hi);
    const basis = full.length ? full : members;
    const stops: TrainrunStop[] = seq.map((node, j) => {
      const i = j + lo;
      const arrs: number[] = [];
      const deps: number[] = [];
      let passes = 0;
      let count = 0;
      for (const t of basis) {
        const p = t.nt.pts[i - t.offset];
        if (!p) continue;
        count++;
        if (p.pass) passes++;
        if (i - t.offset > 0) arrs.push(mod(p.arr, M));
        if (i - t.offset < t.nt.pts.length - 1) deps.push(mod(p.dep, M));
      }
      const s: TrainrunStop = {
        node,
        arr: i === lo || !arrs.length ? null : circMedian(arrs, M),
        dep: i === hi || !deps.length ? null : circMedian(deps, M),
      };
      if (count && passes > count / 2) s.nonStop = true;
      return s;
    });
    const travel = seq.slice(1).map((_, j) => {
      const i = j + lo;
      const xs: number[] = [];
      for (const t of basis) {
        const a = t.nt.pts[i - t.offset];
        const b = t.nt.pts[i + 1 - t.offset];
        if (a && b) xs.push(b.arr - a.dep);
      }
      return Math.round(median(xs));
    });
    // Medoid: the through train closest to the per-stop medians defines the
    // published minutes, so that arr/dep/travel stay mutually consistent even
    // when trains of the family have different dwell times.
    let rep: (typeof full)[number] | undefined;
    let repCost = Infinity;
    for (const t of full) {
      let cost = 0;
      stops.forEach((s, j) => {
        const p = t.nt.pts[j + lo - t.offset]!;
        if (s.arr !== null) cost += circDist(mod(p.arr, M), s.arr, M);
        if (s.dep !== null) cost += circDist(mod(p.dep, M), s.dep, M);
      });
      if (cost < repCost) {
        repCost = cost;
        rep = t;
      }
    }
    if (rep) {
      const r = rep;
      stops.forEach((s, j) => {
        const p = r.nt.pts[j + lo - r.offset]!;
        if (s.arr !== null) s.arr = mod(p.arr, M);
        if (s.dep !== null) s.dep = mod(p.dep, M);
        if (j > 0) travel[j - 1] = p.arr - r.nt.pts[j - 1 + lo - r.offset]!.dep;
      });
    }
    // first/last departure at the first stop (extrapolated for partial runs)
    let firstTimes = members.flatMap((t) => timeAt(t.nt, t.offset, lo) ?? []);
    if (!firstTimes.length) {
      firstTimes = f.members.map((i) => refTimes[i]! + rel[lo]!).filter(Number.isFinite);
    }
    const trips = all.map((i) => g.trips[i]!.nt.trip);
    // headsign: most common among members
    const hs = new Map<string, number>();
    for (const t of members) hs.set(t.nt.trip.headsign, (hs.get(t.nt.trip.headsign) ?? 0) + 1);
    const to = [...hs].sort((a, b) => b[1] - a[1])[0]?.[0] || stationName(seq[seq.length - 1]!);
    drafts.push({
      cat: g.cat,
      seq,
      takt: f.takt,
      members: f.members.length,
      dir: {
        to,
        frequency: f.takt,
        trips: trips.length,
        numbers: formatNumbers(g.cat, trips),
        first: hhmm(Math.min(...firstTimes)),
        last: hhmm(Math.max(...firstTimes)),
        stops,
        travel,
      },
    });
  }
  return drafts;
}

/**
 * Deviation of the symmetry axis from :00/:30 (mod takt/2 for takt < 60).
 * Minutes of each direction are modulo its own takt; the check runs modulo the
 * smaller one.
 */
export function symmetryDeviation(
  fwd: TrainrunStop[],
  back: TrainrunStop[],
  takt: Frequency,
  taktBack: Frequency = takt,
): number | null {
  const m = (t: Frequency) => (t && t < 60 ? t : 60);
  const M = Math.min(m(takt), m(taktBack));
  const devs: number[] = [];
  const byNode = new Map(back.map((s) => [s.node, s]));
  for (const s of fwd) {
    const b = byNode.get(s.node);
    if (!b) continue;
    for (const [x, y] of [
      [s.dep, b.arr],
      [s.arr, b.dep],
    ] as const) {
      if (x === null || y === null) continue;
      const half = mod(x + y, M) / 2;
      devs.push(mod(half + M / 4, M / 2) - M / 4);
    }
  }
  if (!devs.length) return null;
  return Math.round(median(devs) * 2) / 2;
}

/** Knotenzeiten for one node from all Takt line directions touching it. */
export function nodeKnots(
  events: { arr: number | null; dep: number | null; takt: Frequency }[],
): NodeTimes {
  const arr = Array.from({ length: 60 }, () => 0);
  const dep = Array.from({ length: 60 }, () => 0);
  let total = 0;
  for (const e of events) {
    if (!e.takt) continue;
    const T = Math.min(e.takt, 60);
    for (let k = 0; k < 60; k += T) {
      if (e.arr !== null) {
        arr[mod(e.arr + k, 60)]!++;
        total++;
      }
      if (e.dep !== null) {
        dep[mod(e.dep + k, 60)]!++;
        total++;
      }
    }
  }
  const W = 10; // arrivals up to 10' before, departures up to 10' after the knot
  const explained = (knots: number[]) => {
    let n = 0;
    for (let m = 0; m < 60; m++) {
      if (knots.some((k) => mod(k - m, 60) < W)) n += arr[m]!;
      if (knots.some((k) => mod(m - k, 60) < W)) n += dep[m]!;
    }
    return total ? n / total : 0;
  };
  const sets = [[0], [30], [15], [45], [0, 30], [15, 45]];
  let best: number[] = [];
  let bestShare = 0;
  for (const s of sets) {
    const sh = explained(s);
    // a single knot wins unless the pair explains clearly more
    const better = best.length && s.length > best.length ? sh > bestShare * 1.25 : sh > bestShare;
    if (better) {
      best = s;
      bestShare = sh;
    }
  }
  const lines = events.filter((e) => e.takt).length;
  if (lines < 2 || total < 4 || bestShare < 0.5) {
    return { arr, dep, minutes: [], type: null, share: Math.round(bestShare * 100) / 100 };
  }
  const type = best.includes(0) ? "full" : best[0] === 30 ? "half" : "quarter";
  return { arr, dep, minutes: best, type, share: Math.round(bestShare * 100) / 100 };
}

/** Equirectangular projection centred on Austria (km). */
export function project(lat: number, lon: number) {
  const lat0 = 47.6;
  const lon0 = 13.3;
  return {
    x: Math.round((lon - lon0) * Math.cos((lat0 * Math.PI) / 180) * 111.32 * 10) / 10,
    y: Math.round(-(lat - lat0) * 110.57 * 10) / 10,
  };
}

export function buildNetz(feed: Feed, opts: NetzOptions): NetzModel {
  const nodeDefs = new Map(opts.nodes.map((n) => [n.id, n]));
  const cats = new Set(opts.cats);
  const nameOf = (id: string) => nodeDefs.get(id)?.name ?? feed.stations.get(id)?.name ?? id;

  const nodeTrips = projectTrips(
    feed.trips.filter((t) => cats.has(t.cat)),
    new Set(nodeDefs.keys()),
  );
  const km = edgeKm(nodeTrips, feed.stations);
  const composite = compositeEdges(km);
  insertPassThroughs(nodeTrips, composite, km);
  // recompute km after pass-throughs (direct composite pairs disappear)
  const km2 = edgeKm(nodeTrips, feed.stations);

  const drafts = groupPatterns(nodeTrips).flatMap((g) => patternDirections(g, nameOf, opts.takt));
  drafts.sort((a, b) => b.dir.trips - a.dir.trips);

  // pair opposite directions
  const lines: Trainrun[] = [];
  const used = new Set<DirectionDraft>();
  const ids = new Set<string>();
  for (const d of drafts) {
    if (used.has(d)) continue;
    used.add(d);
    const rev = [...d.seq].reverse();
    let partner: DirectionDraft | undefined;
    let partnerScore = -1;
    for (const e of drafts) {
      if (used.has(e) || e.cat !== d.cat) continue;
      let score: number;
      if (e.seq.join(">") === rev.join(">")) score = 3;
      else if (isSubseq(e.seq, rev) >= 0 || isSubseq(rev, e.seq) >= 0) score = 1;
      else continue;
      if (e.takt === d.takt) score += 1;
      if (score > partnerScore || (score === partnerScore && e.dir.trips > partner!.dir.trips)) {
        partner = e;
        partnerScore = score;
      }
    }
    if (partner) used.add(partner);
    let name = `${nameOf(d.seq[0]!)} – ${nameOf(d.seq[d.seq.length - 1]!)}`;
    let id = `${d.cat}-${slug(nameOf(d.seq[0]!))}-${slug(nameOf(d.seq[d.seq.length - 1]!))}`;
    const mid = d.seq[1];
    if (ids.has(id) && d.seq.length > 2 && mid && !ids.has(`${id}-via-${slug(nameOf(mid))}`)) {
      id = `${id}-via-${slug(nameOf(mid))}`;
      name = `${name} (via ${nameOf(mid)})`;
    }
    if (ids.has(id)) {
      let k = 2;
      while (ids.has(`${id}-${k}`)) k++;
      id = `${id}-${k}`;
    }
    ids.add(id);
    lines.push({
      id,
      category: d.cat,
      name,
      frequency: d.takt,
      fwd: d.dir,
      ...(partner ? { back: partner.dir } : {}),
      symmetry: partner
        ? symmetryDeviation(d.dir.stops, partner.dir.stops, d.takt, partner.takt)
        : null,
    });
  }
  lines.sort((a, b) => a.category.localeCompare(b.category) || a.id.localeCompare(b.id));

  // edges
  const edges = new Map<string, NetzEdge>();
  for (const l of lines) {
    for (const dir of [l.fwd, l.back]) {
      if (!dir) continue;
      for (let i = 1; i < dir.stops.length; i++) {
        const x = dir.stops[i - 1]!;
        const y = dir.stops[i]!;
        const [a, b] = x.node < y.node ? [x.node, y.node] : [y.node, x.node];
        const k = `${a}|${b}`;
        let e = edges.get(k);
        if (!e) {
          const d = km2.get(k);
          edges.set(
            k,
            (e = {
              source: a,
              target: b,
              km: d === undefined ? null : Math.round(d * 10) / 10,
              sections: [],
            }),
          );
        }
        let el = e.sections.find((z) => z.trainrun === l.id);
        if (!el) {
          el = {
            trainrun: l.id,
            sourceDeparture: null,
            targetArrival: null,
            targetDeparture: null,
            sourceArrival: null,
            travelTime: null,
            backwardTravelTime: null,
          };
          e.sections.push(el);
        }
        const t = dir.travel[i - 1] ?? null;
        if (x.node === a) {
          el.sourceDeparture ??= x.dep;
          el.targetArrival ??= y.arr;
          el.travelTime ??= t;
        } else {
          el.targetDeparture ??= x.dep;
          el.sourceArrival ??= y.arr;
          el.backwardTravelTime ??= t;
        }
      }
    }
  }

  // nodes + Knotenzeiten
  const used2 = new Set<string>();
  for (const e of edges.values()) used2.add(e.source).add(e.target);
  const nodes: NetzNode[] = [];
  for (const def of opts.nodes) {
    if (!used2.has(def.id)) continue;
    const st: Station | undefined = feed.stations.get(def.id);
    if (!st) continue;
    const events: { arr: number | null; dep: number | null; takt: Frequency }[] = [];
    let count = 0;
    for (const l of lines) {
      for (const dir of [l.fwd, l.back]) {
        const s = dir?.stops.find((z) => z.node === def.id);
        if (!s) continue;
        count++;
        if (!s.nonStop) events.push({ arr: s.arr, dep: s.dep, takt: dir!.frequency });
      }
    }
    const hafasId = opts.hafas?.get(def.id);
    nodes.push({
      id: def.id,
      code: def.code,
      name: def.name ?? st.name,
      lat: Math.round(st.lat * 1e5) / 1e5,
      lon: Math.round(st.lon * 1e5) / 1e5,
      ...project(st.lat, st.lon),
      ...(hafasId ? { hafasId } : {}),
      trainruns: count,
      nodeTimes: nodeKnots(events),
    });
  }

  return {
    day: opts.day,
    source: opts.source,
    categories: opts.cats,
    nodes,
    trainruns: lines,
    edges: [...edges.values()].sort(
      (x, y) => x.source.localeCompare(y.source) || x.target.localeCompare(y.target),
    ),
  };
}
