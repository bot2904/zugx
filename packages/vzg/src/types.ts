/**
 * VzG-Grafik data: speed profiles, kilometre positions and operating points per railway line and
 * track, derived from OpenStreetMap (© OpenStreetMap contributors, ODbL 1.0).
 */

/** Intermediate OSM extract (`.cache/osm-rail.json`, scripts/extract.ts). */
export interface RailExtract {
  source: string;
  created: string;
  /** `route=tracks` relations: one per line, e.g. ref "101 01" */
  lines: {
    id: number;
    ref: string;
    name: string;
    operator: string;
    from?: string;
    to?: string;
    ways: number[];
  }[];
  ways: { id: number; nodes: number[]; tags: Record<string, string> }[];
  /** railway nodes on the tracks (signals, stops, milestones, switches …) */
  nodes: { id: number; tags: Record<string, string> }[];
  /** named stations and halts (often beside the tracks), with coordinates */
  stations: { id: number; lat: number; lon: number; tags: Record<string, string> }[];
  /** node id → [lat, lon] */
  coords: Record<number, [number, number]>;
}

/** One line (Streckennummer) with its tracks, as stored in `data/<ref>.toml`. */
export interface VzgLine {
  /** ÖBB line number, e.g. "101 01" */
  ref: string;
  name?: string;
  operator?: string;
  from?: string;
  to?: string;
  source: string;
  tracks: VzgTrack[];
}

export interface VzgTrack {
  /** Regelgleis of direction "1" / "2" (ÖBB section track numbers …1/…2); "1" on single-track lines */
  track: string;
  /** km range covered by this track (km increasing) */
  kmFrom: number;
  kmTo: number;
  /** length along the track geometry (km) */
  length: number;
  /**
   * speed limit sections: [kmFrom, kmTo, km/h in direction of increasing km, km/h decreasing]
   * (null = unknown)
   */
  speeds: [number, number, number | null, number | null][];
  /** curves with radius < 3000 m: [kmFrom, kmTo, radius m] (estimated from the geometry) */
  curves: [number, number, number][];
  /** operating points along the track: stations, halts, signals, switches, level crossings */
  points: VzgPoint[];
  /** km values interpolated between OSM positions (true) or measured on the node (false) */
}

export interface VzgPoint {
  km: number;
  /** station | halt | stop | signal | switch | level_crossing | milestone | buffer_stop */
  kind: string;
  /** name or signal ref, e.g. "Maria Anzbach", "Ae22/r" (absent if OSM has none) */
  label?: string;
  /** km measured in OSM (railway:position) rather than interpolated */
  measured?: boolean;
  /** signal type, e.g. "main", "distant", "speed_limit" */
  signal?: string;
}
