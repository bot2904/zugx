// Shared read helpers on the local SQLite (node-gtfs schema) for the data exports.
import { existsSync } from "node:fs";
import { openDb } from "gtfs";
import type { Gtfs, Route, Trip } from "@zugx/gtfs";
import { DB_PATH } from "./index.ts";

export type Db = ReturnType<typeof openDb>;

/** open .cache/zugx.sqlite (read-only use); fails with a hint if it hasn't been built */
export function openZugxDb(path = DB_PATH): Db {
  if (!existsSync(path)) throw new Error(`${path} missing — run \`vp run db:build\` first`);
  return openDb({ sqlitePath: path });
}

/** all rows of a query */
export const rows = <T>(db: Db, sql: string, ...params: unknown[]): T[] =>
  db.prepare(sql).all(...params) as T[];

/** GTFS rail route types: 2 and the extended rail types 100–117 */
export const RAIL_ROUTE_TYPES = "(r.route_type = 2 or r.route_type between 100 and 117)";

/** days since 1970-01-01 of a GTFS date (yyyymmdd as number or string) */
export function dayNumber(yyyymmdd: number | string): number {
  const s = String(yyyymmdd);
  return Math.round(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)) / 86_400_000);
}

/**
 * service id → sorted active days (days since 1970-01-01): calendar ranges with their weekdays,
 * then calendar_dates added/removed — as @zugx/gtfs loadGtfs
 */
export function serviceDays(db: Db): Map<string, number[]> {
  const cal = new Map<string, Set<number>>();
  type C = Record<"service_id" | "start_date" | "end_date", string> & Record<string, number>;
  const WD = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  for (const c of rows<C>(db, "select * from calendar")) {
    const days = cal.get(c.service_id) ?? new Set<number>();
    cal.set(c.service_id, days);
    const end = dayNumber(c.end_date);
    // day 0 (1970-01-01) was a Thursday
    for (let d = dayNumber(c.start_date); d <= end; d++) if (c[WD[(d + 4) % 7]!] === 1) days.add(d);
  }
  for (const x of rows<{ service_id: string; date: string; exception_type: number }>(
    db,
    "select service_id, date, exception_type from calendar_dates",
  )) {
    let days = cal.get(x.service_id);
    if (!days) cal.set(x.service_id, (days = new Set()));
    if (x.exception_type === 1) days.add(dayNumber(x.date));
    else days.delete(dayNumber(x.date));
  }
  return new Map([...cal].map(([id, d]) => [id, [...d].sort((a, b) => a - b)]));
}

/**
 * The in-memory GTFS structure of @zugx/gtfs (agencies, routes, trips, stops, services, stop
 * times), read from the SQLite instead of the zip — same content and order (file order = rowid),
 * so scripts can switch without changing their output. `keepTrip` as in loadGtfs.
 */
export function gtfsFromDb(
  db: Db,
  opts: { keepTrip?: (t: Trip, r: Route | undefined) => boolean; sources?: string[] } = {},
): Gtfs {
  const g: Gtfs = {
    feeds: (opts.sources ?? []).map((source) => ({ source, path: "" })),
    agencies: new Map(),
    routes: new Map(),
    trips: new Map(),
    stops: new Map(),
    services: serviceDays(db),
    stopTimes: new Map(),
  };
  type A = { id: string | null; name: string; url: string };
  const agencies = rows<A>(
    db,
    "select agency_id id, agency_name name, agency_url url from agency order by rowid",
  );
  for (const a of agencies)
    g.agencies.set(a.id ?? "", { id: a.id ?? "", name: a.name, url: a.url });
  const defaultAgency = agencies[0]?.id ?? "";
  type R = {
    id: string;
    agency: string | null;
    short: string | null;
    long: string | null;
    type: number;
  };
  for (const r of rows<R>(
    db,
    `select route_id id, agency_id agency, route_short_name short, route_long_name long,
            route_type type from routes order by rowid`,
  ))
    g.routes.set(r.id, {
      id: r.id,
      agencyId: r.agency || defaultAgency,
      shortName: r.short ?? "",
      longName: r.long ?? "",
      type: r.type,
    });
  type S = {
    id: string;
    name: string | null;
    lat: number | null;
    lon: number | null;
    parent: string | null;
    type: number | null;
    platform: string | null;
  };
  for (const s of rows<S>(
    db,
    `select stop_id id, stop_name name, stop_lat lat, stop_lon lon, parent_station parent,
            location_type type, platform_code platform from stops order by rowid`,
  ))
    g.stops.set(s.id, {
      id: s.id,
      name: s.name ?? "",
      lat: s.lat ?? NaN,
      lon: s.lon ?? NaN,
      parent: s.parent ?? "",
      type: s.type ?? 0,
      ...(s.platform ? { platform: s.platform } : {}),
    });
  type T = {
    id: string;
    route: string;
    service: string;
    short: string | null;
    headsign: string | null;
  };
  for (const t of rows<T>(
    db,
    `select trip_id id, route_id route, service_id service, trip_short_name short,
            trip_headsign headsign from trips order by rowid`,
  )) {
    const trip: Trip = {
      id: t.id,
      routeId: t.route,
      serviceId: t.service,
      shortName: (t.short ?? "").trim(),
      headsign: t.headsign ?? "",
    };
    if (opts.keepTrip && !opts.keepTrip(trip, g.routes.get(trip.routeId))) continue;
    g.trips.set(trip.id, trip);
  }
  type ST = {
    trip: string;
    stop: string;
    arr: number | null;
    dep: number | null;
    pu: number | null;
    dr: number | null;
  };
  for (const r of rows<ST>(
    db,
    // trips in the order of their first row in stop_times.txt (as the streaming reader)
    `select trip_id trip, stop_id stop, arrival_timestamp arr, departure_timestamp dep,
            pickup_type pu, drop_off_type dr
       from stop_times order by min(rowid) over (partition by trip_id), stop_sequence`,
  )) {
    if (!g.trips.has(r.trip)) continue;
    let list = g.stopTimes.get(r.trip);
    if (!list) g.stopTimes.set(r.trip, (list = []));
    const arr = r.arr ?? r.dep ?? NaN;
    const dep = r.dep ?? r.arr ?? NaN;
    list.push({ stopId: r.stop, arr, dep, pickup: r.pu ?? 0, dropoff: r.dr ?? 0 });
  }
  return g;
}

/**
 * GTFS tables as records (column → value as text, null → ""), rows in file order (rowid): for
 * readers written against the CSV files (packages/netz)
 */
export function recordSource(db: Db): { records(name: string): Iterable<Record<string, string>> } {
  const TABLES = new Set([
    "agency",
    "stops",
    "routes",
    "trips",
    "calendar",
    "calendar_dates",
    "stop_times",
  ]);
  return {
    *records(name: string) {
      if (!TABLES.has(name)) return;
      for (const row of db.prepare(`select * from ${name} order by rowid`).iterate()) {
        const out: Record<string, string> = {};
        // SQLite values: text, integer, real or null
        for (const [k, v] of Object.entries(row as Record<string, string | number | null>))
          out[k] = v === null ? "" : String(v);
        yield out;
      }
    },
  };
}
