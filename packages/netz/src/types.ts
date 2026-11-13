/**
 * Output types of the netz pipeline (consumed by the UI).
 *
 * - `data/netz.json`        → {@link NetzModel}
 * - `data/corridors/*.json` → {@link Corridor}, index → {@link CorridorIndex}
 * - `data/nge.json`         → Netzgrafik-Editor DTO (see `nge.ts`)
 *
 * All minutes are local time (Europe/Vienna) of the reference day.
 */

/** Takt (headway) in minutes; `null` = no regular interval ("zeitweise"). */
export type Takt = 15 | 30 | 60 | 120 | null;

/** A Knoten (major station) of the Netzgrafik. */
export interface NetzNode {
  /** parent station DHID from GTFS, e.g. `Pat:44:41164` */
  id: string;
  /** short code (zugx-internal, unique, 2–4 chars), e.g. `LZ` */
  code: string;
  /** display name, e.g. `Linz/Donau Hbf` */
  name: string;
  lat: number;
  lon: number;
  /** schematic position: equirectangular projection in km, x east / y south of 47.6°N 13.3°E */
  x: number;
  y: number;
  /** HAFAS station id, if the DHID→HAFAS map was available at build time */
  hafasId?: string;
  /** number of line directions arriving or departing here */
  lines: number;
  /** Knotenzeiten summary, see {@link NodeKnots} */
  knots: NodeKnots;
}

/**
 * Knotenzeiten: when do trains meet at a node?
 *
 * Every arrival/departure minute of every Takt line (both directions) is
 * expanded over the hour (a 30' line contributes `m` and `m+30`). A knot at
 * minute `k` counts arrivals in `(k-15, k]` and departures in `[k, k+15)`.
 */
export interface NodeKnots {
  /** minutes 0–59 → number of Takt arrivals at that minute (expanded over the hour) */
  arr: number[];
  /** minutes 0–59 → number of Takt departures at that minute */
  dep: number[];
  /** knot minutes (subset of 0/15/30/45) explaining ≥ 50 % of events, best first */
  minutes: number[];
  /**
   * classification of the strongest knot:
   * `voll` = :00 (Vollknoten), `halb` = :30 (Halbknoten), `viertel` = :15/:45,
   * `null` = no clear knot (or too few Takt lines)
   */
  type: "voll" | "halb" | "viertel" | null;
  /** share (0–1) of events that fit the knot(s) in `minutes` */
  share: number;
}

/**
 * A line's stop at a node. Minutes are 0–59; for a direction with Takt < 60
 * they are the first slot of the hour (modulo the direction's takt).
 */
export interface LineStop {
  /** node id */
  node: string;
  /** arrival minute; null at the origin */
  arr: number | null;
  /** departure minute; null at the destination */
  dep: number | null;
  /** true if the train passes the node without stopping (time interpolated) */
  pass?: boolean;
}

/** One direction of a line. */
export interface LineDirection {
  /** headsign of the representative trip, e.g. `Salzburg Hbf` */
  to: string;
  /** Takt of this direction (may differ from the opposite one, e.g. 30' one way, 60' back) */
  takt: Takt;
  /** trips on the reference day in this direction (incl. partial runs) */
  trips: number;
  /** train numbers, e.g. `RJX 640–699` or `RJ 531, 533` */
  numbers: string;
  /** first / last departure at the first node, "HH:MM" */
  first: string;
  last: string;
  /** stops in travel order */
  stops: LineStop[];
  /** travel time (minutes) between consecutive stops, `travel[i]` = stops[i] → stops[i+1] */
  travel: number[];
}

/** A line pattern: trips of one category serving the same node sequence. */
export interface NetzLine {
  /** stable id, e.g. `RJX-wien-hbf-salzburg-hbf` */
  id: string;
  /** category, e.g. `RJX` */
  cat: string;
  /** `Wien Hbf – Salzburg Hbf` (forward direction) */
  name: string;
  /** Takt of the forward direction */
  takt: Takt;
  /** forward direction (the one with more trips) */
  fwd: LineDirection;
  /** opposite direction, if paired; its stops are listed in its own travel order */
  back?: LineDirection;
  /**
   * Symmetry check: deviation (minutes) of this line's symmetry axis from the
   * standard Symmetrieminute (:00/:30, i.e. modulo 30 — modulo takt/2 for takt < 60).
   * 0 = perfectly symmetric around :00/:30; range [-15, 15) (± takt/4 for takt < 60). `null` if not paired.
   */
  symmetry: number | null;
}

/** Per-line minute labels on an edge (one entry per line serving the edge). */
export interface EdgeLine {
  line: string;
  /** departure at `a` / arrival at `b` of trains running a → b */
  aDep: number | null;
  bArr: number | null;
  /** departure at `b` / arrival at `a` of trains running b → a */
  bDep: number | null;
  aArr: number | null;
  /** travel time a → b and b → a (minutes) */
  travel: number | null;
  travelBack: number | null;
}

/** Edge between two nodes that are consecutive on at least one line. */
export interface NetzEdge {
  /** node ids, `a` < `b` lexicographically */
  a: string;
  b: string;
  /** median track distance in km (from GTFS shape_dist_traveled) */
  km: number | null;
  lines: EdgeLine[];
}

export interface NetzModel {
  /** reference day YYYY-MM-DD */
  day: string;
  source: string;
  /** categories considered */
  cats: string[];
  nodes: NetzNode[];
  lines: NetzLine[];
  edges: NetzEdge[];
}

/** A station on a Bildfahrplan corridor. */
export interface CorridorStation {
  /** parent station DHID */
  id: string;
  name: string;
  /** km from the corridor start (along track, or haversine fallback) */
  km: number;
  /** major node (labelled prominently) */
  major: boolean;
}

/**
 * A train on a corridor. `pts` = `[stationIndex, arr, dep]`, minutes since
 * midnight of the reference day (can exceed 1440 for trains after midnight);
 * `arr` is null where the train starts, `dep` null where it ends (within the corridor).
 */
export interface CorridorTrain {
  cat: string;
  nr: string;
  /** 1 = in station order (increasing km), -1 = reverse */
  dir: 1 | -1;
  headsign: string;
  pts: [number, number | null, number | null][];
  /**
   * running days over the timetable year (see {@link Corridor.begin}): base64 bitset,
   * bit i = day `begin + i`, MSB first (like HAFAS sDaysB and the train index)
   */
  days: string;
}

export interface Corridor {
  id: string;
  name: string;
  /** reference day used to derive the station list */
  day: string;
  /** timetable period covered by the trains' running days */
  begin: string;
  end: string;
  source: string;
  stations: CorridorStation[];
  trains: CorridorTrain[];
}

export interface CorridorIndexEntry {
  id: string;
  name: string;
  /** ÖBB Fahrplanbild number(s), e.g. "101" or "100/101" */
  oebb?: string;
  from: string;
  to: string;
  km: number;
  stations: number;
  trains: number;
  file: string;
  /** names of the major (anchor) stations, in corridor order */
  major: string[];
  /** all station names, in corridor order (for search) */
  names: string[];
  /** trains per category on the reference day, most frequent first */
  cats: Record<string, number>;
}

export interface CorridorIndex {
  /** old corridor ids → current id (e.g. "brenner" → "300") */
  aliases?: Record<string, string>;
  /** reference day (station lists, train counts, category mix) */
  day: string;
  begin: string;
  end: string;
  source: string;
  corridors: CorridorIndexEntry[];
}
