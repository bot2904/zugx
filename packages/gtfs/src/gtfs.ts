// Load the parts of one or more GTFS feeds the data pipelines need, streaming.
// Pass 1 reads the small tables, pass 2 reads stop_times.txt for the kept trips only;
// shapes.txt and other large files are never inflated.
import { CsvParser } from "./csv.ts";
import type { FeedSource } from "./feed.ts";
import { streamZip, type EntrySink } from "./zip.ts";

export interface Agency {
  id: string;
  name: string;
  url: string;
}

export interface Route {
  id: string;
  agencyId: string;
  shortName: string;
  longName: string;
  type: number;
}

export interface Trip {
  id: string;
  routeId: string;
  serviceId: string;
  shortName: string;
  headsign: string;
}

export interface Stop {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** parent station id, "" if none */
  parent: string;
  /** GTFS location_type (0 = stop/platform, 1 = station, …) */
  type: number;
}

export interface StopTime {
  stopId: string;
  /** seconds after midnight of the service day (may exceed 24 h) */
  arr: number;
  dep: number;
  /** GTFS pickup_type / drop_off_type (1 = none) */
  pickup: number;
  dropoff: number;
}

export interface Gtfs {
  feeds: FeedSource[];
  agencies: Map<string, Agency>;
  routes: Map<string, Route>;
  trips: Map<string, Trip>;
  stops: Map<string, Stop>;
  /** service id → sorted active days (days since 1970-01-01) */
  services: Map<string, number[]>;
  /** trip id → stop times in stop_sequence order */
  stopTimes: Map<string, StopTime[]>;
}

export interface LoadOptions {
  /** keep only trips for which this returns true (default: all) */
  keepTrip?: (trip: Trip, route: Route | undefined) => boolean;
  log?: (msg: string) => void;
}

/** GTFS route_type for rail: 2 plus the extended rail types 100–117. */
export const isRailRouteType = (t: number) => t === 2 || (t >= 100 && t <= 117);

// service days as day numbers since 1970-01-01 (compact bitsets); cached, called in hot loops
const EPOCH = Temporal.PlainDate.from("1970-01-01");
const dayNumbers = new Map<string, number>();
const isoDays = new Map<number, string>();

export const dayNumber = (yyyymmdd: string) => {
  let n = dayNumbers.get(yyyymmdd);
  if (n === undefined) {
    const d = Temporal.PlainDate.from(
      `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`,
    );
    dayNumbers.set(yyyymmdd, (n = EPOCH.until(d).days));
  }
  return n;
};

export const isoDay = (day: number) => {
  let s = isoDays.get(day);
  if (s === undefined) isoDays.set(day, (s = EPOCH.add({ days: day }).toString()));
  return s;
};

export const dayFromIso = (iso: string) => dayNumber(iso.replaceAll("-", ""));

/** "25:42:00" → 92520 */
export function parseGtfsTime(s: string): number {
  if (!s) return NaN;
  const [h = "", m = "", sec = "0"] = s.split(":");
  return +h * 3600 + +m * 60 + +sec;
}

type RowHandler = (get: (col: string) => string) => void;

function tableSink(onRow: RowHandler): EntrySink {
  const decoder = new TextDecoder("utf-8");
  let index: Map<string, number> | undefined;
  let current: string[] = [];
  const get = (col: string) => {
    const i = index!.get(col);
    return i === undefined ? "" : (current[i] ?? "");
  };
  const parser = new CsvParser((row) => {
    if (!index) {
      index = new Map(row.map((h, i) => [h.trim(), i]));
      return;
    }
    current = row;
    onRow(get);
  });
  return {
    data: (chunk) => parser.push(decoder.decode(chunk, { stream: true })),
    end: () => {
      parser.push(decoder.decode());
      parser.end();
    },
  };
}

async function readTables(path: string, handlers: Record<string, RowHandler>) {
  const seen = new Set<string>();
  await streamZip(path, (name) => {
    const base = name.split("/").pop() ?? name;
    const h = handlers[base];
    if (!h) return undefined;
    seen.add(base);
    return tableSink(h);
  });
  return seen;
}

export async function loadGtfs(feeds: FeedSource[], opts: LoadOptions = {}): Promise<Gtfs> {
  const log = opts.log ?? console.log;
  const g: Gtfs = {
    feeds,
    agencies: new Map(),
    routes: new Map(),
    trips: new Map(),
    stops: new Map(),
    services: new Map(),
    stopTimes: new Map(),
  };
  for (const [fi, feed] of feeds.entries()) {
    const t0 = Date.now();
    // with several feeds, prefix feed-local ids; stop ids (DHIDs) are global
    const px = feeds.length > 1 ? `f${fi}:` : "";
    const calendar = new Map<string, Set<number>>();
    let defaultAgency = "";
    const feedTrips: Trip[] = [];
    const exceptions: [service: string, day: number, add: boolean][] = [];
    const seen = await readTables(feed.path, {
      "agency.txt": (get) => {
        const id = px + get("agency_id");
        if (!defaultAgency) defaultAgency = id;
        g.agencies.set(id, { id, name: get("agency_name"), url: get("agency_url") });
      },
      "routes.txt": (get) => {
        const id = px + get("route_id");
        g.routes.set(id, {
          id,
          agencyId: get("agency_id") ? px + get("agency_id") : "",
          shortName: get("route_short_name"),
          longName: get("route_long_name"),
          type: +get("route_type"),
        });
      },
      "trips.txt": (get) => {
        feedTrips.push({
          id: px + get("trip_id"),
          routeId: px + get("route_id"),
          serviceId: px + get("service_id"),
          shortName: get("trip_short_name").trim(),
          headsign: get("trip_headsign"),
        });
      },
      "stops.txt": (get) => {
        const id = get("stop_id");
        if (g.stops.has(id)) return;
        g.stops.set(id, {
          id,
          name: get("stop_name"),
          lat: +get("stop_lat"),
          lon: +get("stop_lon"),
          parent: get("parent_station"),
          type: +(get("location_type") || 0),
        });
      },
      "calendar.txt": (get) => {
        const id = px + get("service_id");
        const days = calendar.get(id) ?? new Set<number>();
        calendar.set(id, days);
        const wd = [
          get("sunday"),
          get("monday"),
          get("tuesday"),
          get("wednesday"),
          get("thursday"),
          get("friday"),
          get("saturday"),
        ];
        const end = dayNumber(get("end_date"));
        for (let d = dayNumber(get("start_date")); d <= end; d++) {
          // day 0 (1970-01-01) was a Thursday
          if (wd[(d + 4) % 7] === "1") days.add(d);
        }
      },
      "calendar_dates.txt": (get) => {
        // applied after calendar.txt (zip order is arbitrary)
        exceptions.push([
          px + get("service_id"),
          dayNumber(get("date")),
          get("exception_type") === "1",
        ]);
      },
    });
    for (const f of ["agency.txt", "routes.txt", "trips.txt", "stops.txt"])
      if (!seen.has(f)) throw new Error(`${feed.path}: missing ${f}`);
    for (const [id, d, add] of exceptions) {
      let days = calendar.get(id);
      if (!days) calendar.set(id, (days = new Set()));
      if (add) days.add(d);
      else days.delete(d);
    }
    for (const [id, days] of calendar)
      g.services.set(
        id,
        [...days].sort((a, b) => a - b),
      );
    for (const r of g.routes.values()) if (!r.agencyId) r.agencyId = defaultAgency;

    let kept = 0;
    for (const t of feedTrips) {
      if (opts.keepTrip && !opts.keepTrip(t, g.routes.get(t.routeId))) continue;
      g.trips.set(t.id, t);
      kept++;
    }

    // pass 2: stop_times of kept trips
    const raw = new Map<string, { seq: number; st: StopTime }[]>();
    let rows = 0;
    const seen2 = await readTables(feed.path, {
      "stop_times.txt": (get) => {
        rows++;
        const tripId = px + get("trip_id");
        if (!g.trips.has(tripId)) return;
        let list = raw.get(tripId);
        if (!list) raw.set(tripId, (list = []));
        const arr = parseGtfsTime(get("arrival_time"));
        const dep = parseGtfsTime(get("departure_time"));
        list.push({
          seq: +get("stop_sequence"),
          st: {
            stopId: get("stop_id"),
            arr: Number.isNaN(arr) ? dep : arr,
            dep: Number.isNaN(dep) ? arr : dep,
            pickup: +(get("pickup_type") || 0),
            dropoff: +(get("drop_off_type") || 0),
          },
        });
      },
    });
    if (!seen2.has("stop_times.txt")) throw new Error(`${feed.path}: missing stop_times.txt`);
    for (const [id, list] of raw) {
      list.sort((a, b) => a.seq - b.seq);
      g.stopTimes.set(
        id,
        list.map((x) => x.st),
      );
    }
    log(
      `gtfs: ${feed.source}: ${feedTrips.length} trips (${kept} kept), ${rows} stop_times rows, ` +
        `${calendar.size} services, ${((Date.now() - t0) / 1000).toFixed(1)} s`,
    );
  }
  return g;
}
