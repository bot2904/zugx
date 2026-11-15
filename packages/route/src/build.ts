// Build the timetable-routing data for the browser (minotor, RAPTOR): one timetable per day and a
// stops index, from the local SQLite of every country built (vp run db:build, COUNTRY=…), merged.
//
// minotor names a leg by its GTFS route; the ÖBB routes are timetable sheets ("A10-1"), so a
// routing GTFS is written first in which every train is its own route ("RJX 162", rail and
// replacement buses only) — legs then carry the train. Output (not committed; served as static
// files): apps/web/public/route/stops.bin, <YYYY-MM-DD>.bin for the next DAYS days, and
// stations.json (HAFAS station id → GTFS parent station, to start a query from the app's ids).
// Border stations are in both feeds under different ids: the straight-line transfers join them.
// Run: vp run route:build   (DAYS=7)
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { GtfsParser, standardGtfsProfile, StraightLineTransferGenerator } from "minotor/parser";
import { openZugxDb, RAIL_ROUTE_TYPES, rows } from "@zugx/db/query";
import { COUNTRIES, dataDir, dbPath, timer, type Country } from "@zugx/gtfs";
import { readToml } from "@zugx/toml";

const root = join(import.meta.dirname, "..", "..", "..");
const OUT = join(root, "apps", "web", "public", "route");
const GTFS = join(root, ".cache", "route-gtfs.zip");
const DAYS = Number(process.env.DAYS) || 7;

/** a CSV table: header + rows, values quoted where needed */
function csv(header: string[], data: (string | number | null | undefined)[][]): Uint8Array {
  const q = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  return strToU8([header.join(","), ...data.map((r) => r.map(q).join(","))].join("\n") + "\n");
}

type Row = (string | number | null | undefined)[];

/**
 * one country's part of the routing GTFS: rail trips with a train name; ids of the other countries
 * than Austria prefixed with the country ("si:1122804"), so the feeds can't collide
 */
function countryTables(c: Country) {
  const db = openZugxDb(dbPath(c));
  type Id = string | number | null | undefined;
  const p = (v: Id): Id =>
    c.id === "at" || v === null || v === undefined || v === "" ? v : `${c.id}:${v}`;
  const named = `${RAIL_ROUTE_TYPES} and trim(coalesce(t.trip_short_name, '')) <> ''`;
  const trips = rows<{ id: string; name: string; service: string; headsign: string | null }>(
    db,
    `select t.trip_id id, trim(t.trip_short_name) name, t.service_id service, t.trip_headsign headsign
       from trips t join routes r using (route_id) where ${named}`,
  );
  const stopTimes = rows<Record<string, string | number | null>>(
    db,
    `select st.trip_id, st.arrival_time, st.departure_time, st.stop_id, st.stop_sequence,
            st.pickup_type, st.drop_off_type
       from stop_times st join trips t using (trip_id) join routes r using (route_id)
      where ${named}`,
  );
  const stops = rows<Record<string, string | number | null>>(
    db,
    `select stop_id, stop_name, stop_lat, stop_lon, location_type, parent_station, platform_code
       from stops`,
  );
  const calendar = rows<Record<string, string | number | null>>(db, "select * from calendar");
  const dates = rows<Record<string, string | number | null>>(
    db,
    "select service_id, date, exception_type from calendar_dates",
  );
  return {
    trips: trips.map((t) => [t.name, p(t.service), p(t.id), t.headsign] as Row),
    names: trips.map((t) => t.name),
    stopTimes: stopTimes.map(
      (s) =>
        [
          p(s.trip_id),
          s.arrival_time,
          s.departure_time,
          p(s.stop_id),
          s.stop_sequence,
          s.pickup_type,
          s.drop_off_type,
        ] as Row,
    ),
    stops: stops.map(
      (s) =>
        [
          p(s.stop_id),
          s.stop_name,
          s.stop_lat,
          s.stop_lon,
          s.location_type,
          p(s.parent_station),
          s.platform_code,
        ] as Row,
    ),
    calendar: calendar.map(
      (k) =>
        [
          p(k.service_id),
          k.monday,
          k.tuesday,
          k.wednesday,
          k.thursday,
          k.friday,
          k.saturday,
          k.sunday,
          k.start_date,
          k.end_date,
        ] as Row,
    ),
    dates: dates.map((k) => [p(k.service_id), k.date, k.exception_type] as Row),
    /** HAFAS station id → (prefixed) GTFS station id */
    hafas: Object.entries(
      readToml<Record<string, { id?: string }>>(
        join(dataDir("stations", c), "gtfs-hafas-map.toml"),
        {},
      ),
    ).flatMap(([gid, e]) => (e.id ? [[e.id, String(p(gid))] as const] : [])),
  };
}

/** the routing GTFS of all countries with a database (vp run db:build), each train a route */
function writeRoutingGtfs() {
  const countries = Object.values(COUNTRIES).filter((c) => existsSync(dbPath(c)));
  const parts = countries.map(countryTables);
  const all = <K extends "trips" | "stopTimes" | "stops" | "calendar" | "dates">(k: K) =>
    parts.flatMap((t) => t[k]);
  const trains = new Set(parts.flatMap((t) => t.names));
  const files: Record<string, Uint8Array> = {
    "agency.txt": csv(
      ["agency_id", "agency_name", "agency_url", "agency_timezone"],
      [
        [
          "zugx",
          countries.map((c) => c.licence.source).join(", "),
          "https://zugx.legner.me",
          "Europe/Vienna",
        ],
      ],
    ),
    "routes.txt": csv(
      ["route_id", "agency_id", "route_short_name", "route_type"],
      [...trains].map((name) => [name, "zugx", name, 2]),
    ),
    "trips.txt": csv(["route_id", "service_id", "trip_id", "trip_headsign"], all("trips")),
    "stop_times.txt": csv(
      [
        "trip_id",
        "arrival_time",
        "departure_time",
        "stop_id",
        "stop_sequence",
        "pickup_type",
        "drop_off_type",
      ],
      all("stopTimes"),
    ),
    "stops.txt": csv(
      [
        "stop_id",
        "stop_name",
        "stop_lat",
        "stop_lon",
        "location_type",
        "parent_station",
        "platform_code",
      ],
      all("stops"),
    ),
    "calendar.txt": csv(
      [
        "service_id",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
        "start_date",
        "end_date",
      ],
      all("calendar"),
    ),
    "calendar_dates.txt": csv(["service_id", "date", "exception_type"], all("dates")),
  };
  mkdirSync(join(root, ".cache"), { recursive: true });
  writeFileSync(GTFS, zipSync(files));
  // a HAFAS id mapped in several feeds (border stations): the station of its own country's feed
  // (UIC prefix: Ljubljana 79… → the Slovenian feed, which has all its trains), else the first
  const hafas: Record<string, string> = {};
  parts.forEach((t, i) => {
    for (const [h, g] of t.hafas)
      if (!(h in hafas) || h.startsWith(countries[i]!.uic)) hafas[h] = g;
  });
  return {
    countries: countries.map((c) => c.id),
    trains: trains.size,
    trips: parts.reduce((n, t) => n + t.trips.length, 0),
    hafas,
  };
}

async function main() {
  const t = timer();
  const g = writeRoutingGtfs();
  console.log(
    `route: routing GTFS (${g.countries.join(", ")}) with ${g.trains} trains, ${g.trips} trips (${t()})`,
  );
  mkdirSync(OUT, { recursive: true });
  for (const f of readdirSync(OUT)) if (f.endsWith(".bin")) rmSync(join(OUT, f));
  // walking between platforms of the same station is in the stop hierarchy; nearby stations
  // (e.g. Wien Hbf ↔ Wien Hbf (Autoreisezug)) get straight-line transfers up to 300 m
  const parser = new GtfsParser(
    GTFS,
    standardGtfsProfile,
    new StraightLineTransferGenerator({ maxDistanceMeters: 300 }),
  );
  const stops = await parser.parseStops();
  writeFileSync(join(OUT, "stops.bin"), stops.serialize());
  writeFileSync(join(OUT, "stations.json"), JSON.stringify(g.hafas));
  const today = Temporal.Now.plainDateISO("Europe/Vienna");
  for (let i = 0; i < DAYS; i++) {
    const day = today.add({ days: i }).toString();
    const tt = await parser.parseTimetable(new Date(`${day}T12:00:00Z`));
    const bin = tt.serialize();
    writeFileSync(join(OUT, `${day}.bin`), bin);
    console.log(`route: ${day}: ${(bin.length / 1024 / 1024).toFixed(1)} MB (${t()})`);
  }
  console.log(`route: ${DAYS} days → ${OUT} (${t()})`);
}

if (import.meta.main) await main();
