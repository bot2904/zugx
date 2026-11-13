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
  {
    id: "arlberg",
    name: "Arlbergbahn Innsbruck – Landeck – Bludenz",
    anchors: [
      "Pat:47:1187", // Innsbruck Hbf
      "Pat:47:1212", // Landeck-Zams
      "Pat:48:130", // Bludenz
    ],
  },
  {
    id: "rheintal",
    name: "Rheintal Bludenz – Feldkirch – Bregenz",
    anchors: [
      "Pat:48:130", // Bludenz
      "Pat:48:817", // Feldkirch
      "Pat:48:585", // Dornbirn
      "Pat:48:452", // Bregenz
    ],
  },
  {
    id: "tauern",
    name: "Tauernbahn Schwarzach – Bad Gastein – Villach",
    anchors: [
      "Pat:45:52197", // Schwarzach-St. Veit
      "Pat:45:52204", // Bad Gastein
      "Pat:42:2128", // Spittal-Millstätter See
      "Pat:42:3654", // Villach Hbf
    ],
  },
  {
    id: "gisela",
    name: "Giselabahn Salzburg – Zell am See – Wörgl",
    anchors: [
      "Pat:45:50002", // Salzburg Hbf
      "Pat:45:52099", // Bischofshofen
      "Pat:45:52197", // Schwarzach-St. Veit
      "Pat:45:54104", // Zell am See
      "Pat:45:54001", // Saalfelden
      "Pat:47:1160", // Kitzbühel
      "Pat:47:1170", // Wörgl Hbf
    ],
  },
  {
    id: "pyhrn",
    name: "Pyhrnbahn Linz – Selzthal – Leoben",
    anchors: [
      "Pat:44:41164", // Linz Hbf
      "Pat:44:43500", // Kirchdorf/Krems
      "Pat:44:43660", // Spital am Pyhrn
      "Pat:46:6938", // Selzthal
      "Pat:46:6344", // Leoben Hbf
    ],
  },
  {
    id: "ennstal",
    name: "Ennstalbahn Selzthal – Bischofshofen",
    anchors: [
      "Pat:46:6938", // Selzthal
      "Pat:46:7437", // Liezen
      "Pat:46:6892", // Stainach-Irdning
      "Pat:45:52099", // Bischofshofen
    ],
  },
  {
    id: "stammstrecke",
    name: "S-Bahn-Stammstrecke Wien Floridsdorf – Meidling",
    anchors: [
      "Pat:49:334", // Wien Floridsdorf
      "Pat:49:1040", // Wien Praterstern
      "Pat:49:743", // Wien Mitte
      "Pat:49:1091", // Wien Rennweg
      "Pat:49:1346", // Wien Quartier Belvedere
      "Pat:49:1349", // Wien Hbf
      "Pat:49:1015", // Wien Meidling
    ],
  },
  {
    id: "nordbahn",
    name: "Nordbahn Wien – Gänserndorf – Břeclav",
    anchors: [
      "Pat:49:334", // Wien Floridsdorf
      "Pat:43:3622", // Gänserndorf
      "Pat:43:3162", // Bernhardsthal
      "Pcz:0:5433425", // Břeclav
    ],
  },
  {
    id: "ostbahn",
    name: "Ostbahn Wien – Bruck/Leitha – Hegyeshalom",
    anchors: [
      "Pat:49:1349", // Wien Hbf
      "Pat:43:3895", // Kledering
      "Pat:43:3538", // Gramatneusiedl
      "Pat:43:3209", // Bruck/Leitha
      "Pat:41:4469", // Parndorf
      "Phu:17905:27000493", // Hegyeshalom
    ],
  },
  {
    id: "westbahn-alt",
    name: "Alte Westbahn Wien Westbf – Wienerwald – St. Pölten",
    anchors: [
      "Pat:49:1468", // Wien Westbahnhof
      "Pat:43:4601", // Purkersdorf Sanatorium
      "Pat:43:4651", // Rekawinkel
      "Pat:43:4337", // Neulengbach
      "Pat:43:4848", // St. Pölten Hbf
    ],
  },
  {
    id: "summerau",
    name: "Summerauer Bahn Linz – Summerau",
    anchors: [
      "Pat:44:41164", // Linz Hbf
      "Pat:44:45090", // Pregarten
      "Pat:44:45260", // Summerau
    ],
  },
  {
    id: "fjb",
    name: "Franz-Josefs-Bahn Wien – Tulln – Gmünd",
    anchors: [
      "Pat:49:345", // Wien Franz-Josefs-Bahnhof
      "Pat:43:5034", // Tulln
      "Pat:43:3004", // Absdorf-Hippersdorf
      "Pat:43:4789", // Sigmundsherberg
      "Pat:43:7169", // Gmünd NÖ
    ],
  },
  {
    id: "kamptal",
    name: "Kamptalbahn Krems – Horn – Sigmundsherberg",
    anchors: [
      "Pat:43:3993", // Krems
      "Pat:43:3660", // Hadersdorf/Kamp
      "Pat:43:4036", // Langenlois
      "Pat:43:3486", // Gars-Thunau
      "Pat:43:3784", // Horn
      "Pat:43:4789", // Sigmundsherberg
    ],
  },
  {
    id: "innviertel",
    name: "Wels – Schärding – Passau",
    anchors: [
      "Pat:44:42107", // Wels Hbf
      "Pat:44:40156", // Neumarkt-Kallham
      "Pat:44:48500", // Schärding
      "Pde:09262:156", // Passau Hbf
    ],
  },
  {
    id: "aspang",
    name: "Aspangbahn Wiener Neustadt – Aspang – Hartberg – Fehring",
    anchors: [
      "Pat:43:5210", // Wiener Neustadt Hbf
      "Pat:43:7034", // Pitten
      "Pat:43:7040", // Edlitz-Grimmenstein
      "Pat:43:7041", // Aspang Markt
      "Pat:46:7543", // Friedberg
      "Pat:46:2022", // Hartberg
      "Pat:46:1960", // Fehring
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
export type CorridorRun = Omit<CorridorTrain, "days">;

export function corridorRuns(trip: Trip, stationIdx: Map<string, number>): CorridorRun[] {
  const out: CorridorRun[] = [];
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

/** Base64 bitset, bit i = day i, MSB first. */
export function encodeDays(days: Iterable<number>, n: number): string {
  const bytes = new Uint8Array(Math.ceil(n / 8));
  for (const i of days) if (i >= 0 && i < n) bytes[i >> 3]! |= 0x80 >> (i & 7);
  return Buffer.from(bytes).toString("base64");
}

export interface YearTrips {
  /** all rail trips of the feed */
  feed: Feed;
  /** running days per service_id (day indexes from `begin`) */
  days: Map<string, Set<number>>;
  begin: string;
  end: string;
}

/**
 * Builds a corridor: stations from the reference-day feed, trains from the whole
 * timetable year; runs with identical times are merged and carry their running days.
 */
export function buildCorridor(
  feed: Feed,
  def: CorridorDef,
  day: string,
  source: string,
  names?: Map<string, string>,
  year?: YearTrips,
): Corridor {
  const stations = corridorStations(feed, def, names);
  const idx = new Map(stations.map((s, i) => [s.id, i]));
  const DAY = 86_400_000;
  const begin = year?.begin ?? day;
  const end = year?.end ?? day;
  const n =
    Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${begin}T00:00:00Z`)) / DAY) + 1;
  const merged = new Map<string, { t: CorridorRun; days: Set<number> }>();
  for (const trip of (year ?? { feed }).feed.trips) {
    const tripDays = year ? year.days.get(trip.service) : new Set([0]);
    if (!tripDays?.size) continue;
    for (const t of corridorRuns(trip, idx)) {
      const key = JSON.stringify(t);
      let m = merged.get(key);
      if (!m) merged.set(key, (m = { t, days: new Set() }));
      for (const d of tripDays) m.days.add(d);
    }
  }
  const trains: CorridorTrain[] = [...merged.values()].map(({ t, days }) => ({
    ...t,
    days: encodeDays(days, n),
  }));
  const t0 = (t: CorridorTrain) => t.pts[0]![2] ?? t.pts[0]![1] ?? 0;
  trains.sort((a, b) => t0(a) - t0(b) || a.nr.localeCompare(b.nr));
  return { id: def.id, name: def.name, day, begin, end, source, stations, trains };
}

/** Compact JSON: one station / train per line. */
export function corridorJson(c: Corridor): string {
  const head = JSON.stringify({
    id: c.id,
    name: c.name,
    day: c.day,
    begin: c.begin,
    end: c.end,
    source: c.source,
  });
  const st = c.stations.map((s) => `    ${JSON.stringify(s)}`).join(",\n");
  const tr = c.trains.map((t) => `    ${JSON.stringify(t)}`).join(",\n");
  return `${head.slice(0, -1)},\n  "stations": [\n${st}\n  ],\n  "trains": [\n${tr}\n  ]\n}\n`;
}
