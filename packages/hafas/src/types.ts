// Normalized, framework-free types produced by the parser.

export type ProductId =
  | "highspeed" // RJX, RJ, ICE (cls 1)
  | "night" // NJ, EN (cls 8, detected by category)
  | "replacement" // rail replacement bus, SEV (cls 2)
  | "intercity" // IC, EC (cls 4)
  | "interregional" // D, NJ, EN, WB, other long distance (cls 8, 4096)
  | "regional" // CJX, REX, R (cls 16)
  | "suburban" // S (cls 32)
  | "bus" // cls 64
  | "ferry" // cls 128
  | "subway" // U (cls 256)
  | "tram" // cls 512
  | "cable" // cls 1024
  | "ondemand" // AST (cls 2048)
  | "other";

export interface Location {
  /** HAFAS external ID (IBNR/EVA), e.g. "8103000" */
  id: string;
  name: string;
  type: "station" | "address" | "poi";
  lat?: number;
  lon?: number;
  /** product class bitmask */
  products?: number;
  /** HAFAS location string, needed for some requests */
  lid?: string;
  /** distance in metres (LocGeoPos) */
  distance?: number;
  /** importance weight from HAFAS */
  weight?: number;
}

export interface Line {
  /** e.g. "RJX 162", "S 50", "Bus 15A" */
  name: string;
  /** e.g. "RJX" */
  category: string;
  /** e.g. "162"; for lines (S-Bahn, buses) the line number, e.g. "2" for "S 2" */
  number: string;
  /** train number if it differs from `number`, e.g. "22734" for "S 2" */
  trainNumber?: string;
  /** e.g. "railjet xpress" */
  categoryLong?: string;
  cls: number;
  product: ProductId;
  operator?: string;
}

export interface StopEvent {
  /** planned time, ISO 8601 with offset */
  planned: string;
  /** realtime prognosis, if any */
  actual?: string;
  /** delay in minutes (actual - planned), if realtime known */
  delay?: number;
  platform?: string;
  plannedPlatform?: string;
  cancelled?: boolean;
}

export interface Stopover {
  stop: Location;
  arr?: StopEvent;
  dep?: StopEvent;
  cancelled?: boolean;
  /** additional, unplanned stop */
  additional?: boolean;
  remarks?: Remark[];
}

export interface Remark {
  kind: "hint" | "warning" | "status";
  code?: string;
  text: string;
  summary?: string;
}

export interface BoardEntry {
  journeyId: string;
  line: Line;
  /** direction / destination text */
  direction: string;
  stop: Location;
  /** event at the board's station (dep for departures, arr for arrivals) */
  when: StopEvent;
  cancelled: boolean;
  remarks: Remark[];
}

export interface Leg {
  kind: "journey" | "walk" | "transfer";
  origin: Location;
  destination: Location;
  dep: StopEvent;
  arr: StopEvent;
  line?: Line;
  direction?: string;
  journeyId?: string;
  stopovers?: Stopover[];
  polyline?: [lat: number, lon: number][];
  remarks: Remark[];
  cancelled?: boolean;
  /** transfer/walk duration in minutes */
  duration?: number;
}

export interface Journey {
  /** reconstruction context, usable for permalinks / refresh */
  recon?: string;
  legs: Leg[];
  dep: StopEvent;
  arr: StopEvent;
  /** minutes */
  duration: number;
  transfers: number;
}

export interface JourneysResult {
  journeys: Journey[];
  earlierRef?: string;
  laterRef?: string;
}

export interface Trip {
  journeyId: string;
  date: string;
  line: Line;
  direction: string;
  stopovers: Stopover[];
  polyline?: [lat: number, lon: number][];
  remarks: Remark[];
  /** running-days text from HAFAS, e.g. "täglich" */
  runningDays?: string;
}

export interface Movement {
  journeyId: string;
  line: Line;
  direction: string;
  lat: number;
  lon: number;
  /** stops around the current position (HAFAS sends a small window, usually 4) */
  nextStops: Stopover[];
  /**
   * current delay in minutes, from the realtime time of the stop closest to now
   * (undefined if HAFAS has no realtime data for this train)
   */
  delay?: number;
}

export interface Warning {
  id: string;
  title: string;
  text: string;
  priority: number;
  /** ISO dates */
  validFrom?: string;
  validUntil?: string;
  modified?: string;
  affectedFrom?: Location;
  affectedTo?: Location;
  products: number;
  category?: string;
}

export interface TripMatch {
  journeyId: string;
  date: string;
  line: Line;
  direction: string;
  origin?: Location;
  destination?: Location;
  dep?: StopEvent;
  arr?: StopEvent;
}
