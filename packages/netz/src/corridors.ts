/**
 * Bildfahrplan (time–distance) corridors.
 *
 * A corridor is defined by ordered anchor stations. Its station list is the
 * anchors plus every station served between two consecutive anchors by a trip
 * that stops at both. Positions (km) come from GTFS shape_dist_traveled: anchor
 * distances are median track distances, intermediate stations are placed by
 * their relative position between the two anchors (haversine fallback).
 */
import { haversineKm, type Feed, type Trip } from "./gtfs.ts";
import type { Corridor, CorridorStation, CorridorTrain } from "./types.ts";

export interface CorridorDef {
  id: string;
  name: string;
  /** anchor station DHIDs in corridor order (all are `major`) */
  anchors: string[];
  /** additional major stations (labelled prominently) */
  major?: string[];
  /**
   * anchors whose segment to the next anchor is a high-speed line without
   * stations (stations served between them belong to a parallel line)
   */
  nonstop?: string[];
  /** max. relative detour vs. the shortest anchor-to-anchor route (default 0.12) */
  detour?: number;
}

export const CORRIDORS: CorridorDef[] = [
  {
    id: "westbahn",
    name: "Westbahn Wien – Salzburg",
    anchors: [
      "Pat:49:1349", // Wien Hbf
      "Pat:49:1015", // Wien Meidling
      "Pat:43:5759", // Tullnerfeld
      "Pat:43:4848", // St. Pölten Hbf
      "Pat:43:7234", // Amstetten
      "Pat:43:7242", // St. Valentin
      "Pat:44:41164", // Linz Hbf
      "Pat:44:42107", // Wels Hbf
      "Pat:44:47200", // Attnang-Puchheim
      "Pat:45:50002", // Salzburg Hbf
    ],
    // Neue Westbahn: Tullnerfeld → St. Pölten has no stations (the Tullnerfelder Bahn via Herzogenburg is parallel)
    nonstop: ["Pat:49:1015", "Pat:43:5759"],
  },
  {
    id: "suedbahn",
    name: "Südbahn Wien – Semmering – Graz",
    anchors: [
      "Pat:49:1349", // Wien Hbf
      "Pat:49:1015", // Wien Meidling
      "Pat:43:3101", // Baden
      "Pat:43:5210", // Wiener Neustadt Hbf
      "Pat:43:8761", // Gloggnitz
      "Pat:43:8769", // Semmering
      "Pat:46:7426", // Mürzzuschlag
      "Pat:46:2065", // Bruck/Mur
      "Pat:46:3040", // Graz Hbf
    ],
  },
  {
    id: "koralm",
    name: "Koralmbahn Graz – Klagenfurt – Villach",
    anchors: [
      "Pat:46:3040", // Graz Hbf
      "Pat:46:30077", // Weststeiermark
      "Pat:42:3721", // St. Paul im Lavanttal
      "Pat:42:3831", // Kühnsdorf-Klopeiner See
      "Pat:42:3642", // Klagenfurt Hbf
      "Pat:42:3654", // Villach Hbf
    ],
    // Koralmbahn: St. Paul → Kühnsdorf is new line; Bleiburg lies on the old Jauntalbahn
    nonstop: ["Pat:42:3721"],
  },
  {
    id: "brenner",
    name: "Unterinntal/Brenner Kufstein – Innsbruck – Brenner",
    anchors: [
      "Pat:47:2184", // Kufstein
      "Pat:47:1170", // Wörgl Hbf
      "Pat:47:61321", // Jenbach
      "Pat:47:1187", // Innsbruck Hbf
      "Pit:22021:1389", // Brennero/Brenner
    ],
  },
];

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** Ordered corridor stations with km. */
export function corridorStations(feed: Feed, def: CorridorDef, names?: Map<string, string>) {
  const anchorIdx = new Map(def.anchors.map((a, i) => [a, i]));
  // station → list of relative positions (0..1) within anchor segment k
  const between = new Map<string, { k: number; f: number[] }>();

  // pass 1: every trip hop between two consecutive anchors
  interface Hop {
    trip: Trip;
    i: number;
    j: number;
    k: number;
    forward: boolean;
    /** track metres between the anchors (NaN if unknown) */
    span: number;
  }
  const hops: Hop[] = [];
  for (const trip of feed.trips) {
    const idx = trip.stops.map((s) => anchorIdx.get(s.st));
    for (let i = 0; i < trip.stops.length; i++) {
      const ai = idx[i];
      if (ai === undefined) continue;
      // next anchor stop of this trip
      let j = i + 1;
      while (j < trip.stops.length && idx[j] === undefined) j++;
      const aj = idx[j];
      if (aj === undefined || Math.abs(aj - ai) !== 1) continue;
      const span = trip.stops[j]!.dist - trip.stops[i]!.dist;
      hops.push({ trip, i, j, k: Math.min(ai, aj), forward: aj > ai, span });
    }
  }
  // the corridor follows the shortest route between anchors: hops more than
  // `detour` longer than the shortest one took a parallel line
  const segDist: number[][] = def.anchors.slice(1).map(() => []);
  const minSpan = def.anchors.slice(1).map((_, k) => {
    const spans = hops.filter((h) => h.k === k && h.span > 0).map((h) => h.span);
    return spans.length ? Math.min(...spans) : NaN;
  });
  const detour = def.detour ?? 0.12;
  const nonstop = new Set((def.nonstop ?? []).map((k) => def.anchors.indexOf(k)));

  for (const { trip, i, j, k, forward, span } of hops) {
    if (span > 0 && span > minSpan[k]! * (1 + detour)) continue;
    if (span > 0) segDist[k]!.push(span / 1000);
    if (nonstop.has(k)) continue;
    const da = trip.stops[i]!.dist;
    for (let m = i + 1; m < j; m++) {
      const s = trip.stops[m]!;
      let f: number;
      if (Number.isFinite(span) && span > 0) f = (s.dist - da) / span;
      else {
        const A = feed.stations.get(trip.stops[i]!.st);
        const B = feed.stations.get(trip.stops[j]!.st);
        const S = feed.stations.get(s.st);
        if (!A || !B || !S) continue;
        const dA = haversineKm(A, S);
        f = dA / (dA + haversineKm(S, B) || 1);
      }
      if (!forward) f = 1 - f;
      let e = between.get(s.st);
      if (!e) between.set(s.st, (e = { k, f: [] }));
      if (e.k === k) e.f.push(Math.min(1, Math.max(0, f)));
    }
  }

  const anchorKm = [0];
  def.anchors.slice(1).forEach((a, k) => {
    let d = segDist[k]!.length ? median(segDist[k]!) : NaN;
    if (!Number.isFinite(d)) {
      const A = feed.stations.get(def.anchors[k]!);
      const B = feed.stations.get(a);
      d = A && B ? haversineKm(A, B) * 1.15 : 0;
    }
    anchorKm.push(anchorKm[k]! + d);
  });

  const nameOf = (id: string) => names?.get(id) ?? feed.stations.get(id)?.name ?? id;
  const major = new Set([...def.anchors, ...(def.major ?? [])]);
  const out: CorridorStation[] = def.anchors.map((id, i) => ({
    id,
    name: nameOf(id),
    km: anchorKm[i]!,
    major: true,
  }));
  for (const [id, { k, f }] of between) {
    if (anchorIdx.has(id)) continue;
    const a = anchorKm[k]!;
    const b = anchorKm[k + 1]!;
    out.push({ id, name: nameOf(id), km: a + median(f) * (b - a), major: major.has(id) });
  }
  out.sort((x, y) => x.km - y.km);
  for (const s of out) s.km = Math.round(s.km * 10) / 10;
  return out;
}

/**
 * Corridor runs of one trip: maximal sequences of consecutive trip stops that
 * are corridor stations in monotonic order. A non-corridor stop in between
 * (train left the corridor) or a direction change splits the run.
 */
export function corridorRuns(trip: Trip, stationIdx: Map<string, number>): CorridorTrain[] {
  const out: CorridorTrain[] = [];
  let cur: [number, number | null, number | null][] = [];
  let dir: 1 | -1 | 0 = 0;
  const flush = () => {
    if (cur.length >= 2 && dir !== 0) {
      // start / end of the run: no arrival / departure shown
      cur[0]![1] = null;
      cur[cur.length - 1]![2] = null;
      out.push({ cat: trip.cat, nr: trip.nr, dir, headsign: trip.headsign, pts: cur });
    }
    cur = [];
    dir = 0;
  };
  trip.stops.forEach((s, i) => {
    const k = stationIdx.get(s.st);
    if (k === undefined) {
      flush();
      return;
    }
    const pt: [number, number | null, number | null] = [k, s.arr, s.dep];
    if (i === 0) pt[1] = null;
    if (i === trip.stops.length - 1) pt[2] = null;
    const last = cur[cur.length - 1];
    if (last) {
      const d = k > last[0] ? 1 : k < last[0] ? -1 : 0;
      if (d === 0 || (dir !== 0 && d !== dir)) {
        flush();
      } else {
        dir = d;
      }
    }
    cur.push(pt);
  });
  flush();
  return out;
}

export function buildCorridor(
  feed: Feed,
  def: CorridorDef,
  day: string,
  source: string,
  names?: Map<string, string>,
): Corridor {
  const stations = corridorStations(feed, def, names);
  const idx = new Map(stations.map((s, i) => [s.id, i]));
  const trains: CorridorTrain[] = [];
  for (const trip of feed.trips) trains.push(...corridorRuns(trip, idx));
  const t0 = (t: CorridorTrain) => t.pts[0]![2] ?? t.pts[0]![1] ?? 0;
  trains.sort((a, b) => t0(a) - t0(b) || a.nr.localeCompare(b.nr));
  return { id: def.id, name: def.name, day, source, stations, trains };
}

/** Compact JSON: one station / train per line. */
export function corridorJson(c: Corridor): string {
  const head = JSON.stringify({ id: c.id, name: c.name, day: c.day, source: c.source });
  const st = c.stations.map((s) => `    ${JSON.stringify(s)}`).join(",\n");
  const tr = c.trains.map((t) => `    ${JSON.stringify(t)}`).join(",\n");
  return `${head.slice(0, -1)},\n  "stations": [\n${st}\n  ],\n  "trains": [\n${tr}\n  ]\n}\n`;
}
