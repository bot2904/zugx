/**
 * GTFS loading: reads the ÖBB GTFS feed (zip or unzipped directory), keeps only
 * rail trips that run on one reference day and resolves stops to their parent
 * stations.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { csvRecords, textChunks } from "./csv.ts";

export const GTFS_URL =
  "https://static.web.oebb.at/open-data/soll-fahrplan-gtfs/GTFS_Fahrplan_2026.zip";

export interface Station {
  /** parent station DHID, e.g. `Pat:41:3087` */
  id: string;
  name: string;
  lat: number;
  lon: number;
}

export interface StopTime {
  /** parent station id */
  st: string;
  /** minutes since midnight of the service day (may exceed 1440), null if unknown */
  arr: number;
  dep: number;
  /** shape_dist_traveled in metres (NaN if absent) */
  dist: number;
}

export interface Trip {
  id: string;
  /** category, e.g. "RJX" */
  cat: string;
  /** train number, e.g. "760" */
  nr: string;
  headsign: string;
  routeId: string;
  stops: StopTime[];
}

export interface Feed {
  stations: Map<string, Station>;
  trips: Trip[];
}

/** Raw GTFS tables as text-chunk iterables (lets tests feed synthetic data). */
export type TableSource = (name: string) => Iterable<string> | undefined;

const NEEDED = ["stops", "routes", "trips", "calendar", "calendar_dates", "stop_times"];

/** Opens the feed: `GTFS_DIR` (unzipped), `GTFS_ZIP`, or the cached download. */
export async function openFeed(cacheDir: string): Promise<TableSource> {
  const dir = process.env.GTFS_DIR;
  if (dir) {
    return (name) => {
      const p = join(dir, `${name}.txt`);
      return existsSync(p) ? textChunks(readFileSync(p)) : undefined;
    };
  }
  let zipPath = process.env.GTFS_ZIP;
  if (!zipPath) {
    zipPath = join(cacheDir, "GTFS_Fahrplan_2026.zip");
    if (!existsSync(zipPath)) {
      console.log(`downloading ${GTFS_URL} …`);
      const res = await fetch(GTFS_URL);
      if (!res.ok) throw new Error(`download failed: ${res.status} ${res.statusText}`);
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(zipPath, new Uint8Array(await res.arrayBuffer()));
    }
  }
  const files = unzipSync(readFileSync(zipPath), {
    filter: (f) => NEEDED.some((n) => f.name.endsWith(`${n}.txt`)),
  });
  const byName = new Map<string, Uint8Array>();
  for (const [path, data] of Object.entries(files)) {
    byName.set(
      path
        .split("/")
        .pop()!
        .replace(/\.txt$/, ""),
      data,
    );
  }
  return (name) => {
    const data = byName.get(name);
    return data ? textChunks(data) : undefined;
  };
}

/** "HH:MM:SS" → minutes since midnight (seconds rounded). */
export function parseGtfsTime(s: string): number {
  const [h, m, sec] = s.split(":").map(Number);
  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return NaN;
  return h * 60 + m + Math.round((sec ?? 0) / 60);
}

/** `2026-03-10` → `20260310` */
const gtfsDate = (day: string) => day.replaceAll("-", "");
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** Set of service_ids active on `day` (YYYY-MM-DD). */
export function activeServices(src: TableSource, day: string): Set<string> {
  const d = gtfsDate(day);
  const weekday = WEEKDAYS[new Date(`${day}T12:00:00Z`).getUTCDay()]!;
  const active = new Set<string>();
  for (const r of csvRecords(src("calendar") ?? [])) {
    if (r[weekday] === "1" && r.start_date! <= d && d <= r.end_date!) active.add(r.service_id!);
  }
  for (const r of csvRecords(src("calendar_dates") ?? [])) {
    if (r.date !== d) continue;
    if (r.exception_type === "1") active.add(r.service_id!);
    else if (r.exception_type === "2") active.delete(r.service_id!);
  }
  return active;
}

/** Strips the generic " Bahnhof" / " Hauptbahnhof" suffixes used in ÖBB stop names. */
export function shortStationName(name: string): string {
  return name
    .replace(/ Hauptbahnhof$/, " Hbf")
    .replace(/ Bahnhof$/, "")
    .replace(/ Bahnhst$/, "")
    .trim();
}

/** Parent station DHID of a stop DHID: `at:48:817:0:2` → `Pat:48:817`. */
export function parentDhid(stopId: string): string {
  const m = /^([a-z]{2}:[^:]+:[^:]+)/.exec(stopId);
  return m ? `P${m[1]}` : stopId;
}

/** Loads all rail trips running on `day`. */
export function loadFeed(src: TableSource, day: string): Feed {
  const stations = new Map<string, Station>();
  const parentOf = new Map<string, string>();
  const orphans: Station[] = [];
  for (const r of csvRecords(src("stops") ?? [])) {
    const id = r.stop_id!;
    const st = {
      id,
      name: shortStationName(r.stop_name!),
      lat: Number(r.stop_lat),
      lon: Number(r.stop_lon),
    };
    if (r.location_type === "1") {
      stations.set(id, st);
      parentOf.set(id, id);
    } else if (r.parent_station) {
      parentOf.set(id, r.parent_station);
    } else {
      // some platforms (e.g. Feldkirch, Bludenz) lack parent_station: derive the
      // parent DHID from the stop DHID (`at:48:817:0:2` → `Pat:48:817`)
      const parent = parentDhid(id);
      parentOf.set(id, parent);
      orphans.push({ ...st, id: parent });
    }
  }
  for (const o of orphans) if (!stations.has(o.id)) stations.set(o.id, o);

  const busRoutes = new Set<string>();
  for (const r of csvRecords(src("routes") ?? [])) {
    // 2 = rail; 3 = bus (Schienenersatzverkehr), everything else non-rail too
    if (r.route_type !== "2" && !(Number(r.route_type) >= 100 && Number(r.route_type) < 200)) {
      busRoutes.add(r.route_id!);
    }
  }

  const services = activeServices(src, day);
  const trips = new Map<string, Trip>();
  for (const r of csvRecords(src("trips") ?? [])) {
    if (!services.has(r.service_id!) || busRoutes.has(r.route_id!)) continue;
    const short = (r.trip_short_name ?? "").trim();
    if (!short) continue;
    const m = /^(\S+)\s+(.+)$/.exec(short);
    trips.set(r.trip_id!, {
      id: r.trip_id!,
      cat: m ? m[1]! : short,
      nr: m ? m[2]! : "",
      headsign: shortStationName(r.trip_headsign ?? ""),
      routeId: r.route_id!,
      stops: [],
    });
  }

  const seq = new Map<Trip, number[]>();
  for (const r of csvRecords(src("stop_times") ?? [])) {
    const trip = trips.get(r.trip_id!);
    if (!trip) continue;
    const arr = parseGtfsTime(r.arrival_time || r.departure_time!);
    const dep = parseGtfsTime(r.departure_time || r.arrival_time!);
    trip.stops.push({
      st: parentOf.get(r.stop_id!) ?? r.stop_id!,
      arr,
      dep,
      dist: r.shape_dist_traveled ? Number(r.shape_dist_traveled) : NaN,
    });
    let s = seq.get(trip);
    if (!s) seq.set(trip, (s = []));
    s.push(Number(r.stop_sequence));
  }
  // stop_times.txt is not guaranteed to be sorted
  for (const [trip, s] of seq) {
    if (s.every((v, i) => i === 0 || v >= s[i - 1]!)) continue;
    const order = s.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
    trip.stops = order.map(([, i]) => trip.stops[i]!);
  }
  return { stations, trips: [...trips.values()].filter((t) => t.stops.length >= 2) };
}

/** Great-circle distance in km. */
export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371;
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
