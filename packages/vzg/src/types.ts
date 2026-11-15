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
    /** Wikidata item of the line (OSM `wikidata` tag), e.g. "Q694717" */
    wikidata?: string;
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
  /** file and URL id: ÖBB "101-01", others from the name, e.g. "stubaitalbahn" */
  id: string;
  /** ÖBB line number, e.g. "101 01"; other lines: their own ref if any (e.g. "N") */
  ref?: string;
  /** track gauge in mm (most common on the line), e.g. "1435", "1000", "760" */
  gauge?: string;
  /** Wikidata item (from the OSM relation), e.g. "Q109907736" */
  wikidata?: string;
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
}

export interface VzgPoint {
  km: number;
  /** UIC station number (OSM uic_ref) = IBNR = HAFAS station id, e.g. "8100008" */
  uic?: string;
  /** stations, halts, stops: position [lat, lon] (to link them with timetable stations) */
  pos?: [number, number];
  /** station | halt | stop | signal | switch | level_crossing | milestone | buffer_stop */
  kind: string;
  /** name or signal ref, e.g. "Maria Anzbach", "Ae22/r" (absent if OSM has none) */
  label?: string;
  /** km measured in OSM (railway:position) rather than interpolated */
  measured?: boolean;
  /** signal type, e.g. "main", "distant", "speed_limit" */
  signal?: string;
}

/** `data/index.toml`: one entry per built line */
export interface VzgIndex {
  source: string;
  created: string;
  lines: VzgIndexEntry[];
}
export interface VzgIndexEntry {
  id: string;
  ref?: string;
  /** ÖBB line (Streckennummer per VzG) */
  oebb: boolean;
  operator?: string;
  gauge?: string;
  wikidata?: string;
  name?: string;
  from?: string;
  to?: string;
  /** file name in data/, e.g. "101-01.toml" */
  file: string;
  tracks: string[];
  kmFrom: number;
  kmTo: number;
  length: number;
  /** share of the km range with a known speed limit (worst track) */
  speedCoverage: number;
  stations: number;
  signals: number;
  /** names of the stations and halts along the line (for the search) */
  names: string[];
}

/** URL/file id of a line: "101 01" → "101-01", "Lokalbahn Wien – Baden" → "lokalbahn-wien-baden" */
export function lineId(refOrName: string): string {
  if (/^\d{3} \d{2}$/.test(refOrName)) return refOrName.replace(" ", "-");
  return refOrName
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
