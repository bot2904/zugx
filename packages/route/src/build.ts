// Build the timetable-routing data for the browser (minotor, RAPTOR): one timetable per day and a
// stops index, from the local SQLite (vp run db:build).
//
// minotor names a leg by its GTFS route; the ÖBB routes are timetable sheets ("A10-1"), so a
// routing GTFS is written first in which every train is its own route ("RJX 162", rail and
// replacement buses only) — legs then carry the train. Output (not committed; served as static
// files): apps/web/public/route/stops.bin, <YYYY-MM-DD>.bin for the next DAYS days, and
// stations.json (HAFAS station id → GTFS parent station, to start a query from the app's ids).
// Run: vp run route:build   (DAYS=7)
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { GtfsParser, standardGtfsProfile, StraightLineTransferGenerator } from "minotor/parser";
import { openZugxDb, rows } from "@zugx/db/query";
import { parseTrainName, timer } from "@zugx/gtfs";
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

/** the routing GTFS: rail trips with a train name, each train a route of its own */
function writeRoutingGtfs() {
  const db = openZugxDb();
  const rail = "(r.route_type = 2 or r.route_type between 100 and 117)";
  const trips = rows<{ id: string; name: string; service: string; headsign: string | null }>(
    db,
    `select t.trip_id id, trim(t.trip_short_name) name, t.service_id service, t.trip_headsign headsign
       from trips t join routes r using (route_id)
      where ${rail} and trim(coalesce(t.trip_short_name, '')) <> ''`,
  );
  const trains = new Map<string, string>(); // route id (train name) → category
  for (const t of trips) {
    const tn = parseTrainName(t.name);
    trains.set(t.name, tn?.cat ?? "");
  }
  const keep = new Set(trips.map((t) => t.id));
  const stopTimes = rows<Record<string, string | number | null>>(
    db,
    `select st.trip_id, st.arrival_time, st.departure_time, st.stop_id, st.stop_sequence,
            st.pickup_type, st.drop_off_type
       from stop_times st join trips t using (trip_id) join routes r using (route_id)
      where ${rail} and trim(coalesce(t.trip_short_name, '')) <> ''`,
  );
  const stops = rows<Record<string, string | number | null>>(
    db,
    `select stop_id, stop_name, stop_lat, stop_lon, location_type, parent_station, platform_code
       from stops`,
  );
  const files: Record<string, Uint8Array> = {
    "agency.txt": csv(
      ["agency_id", "agency_name", "agency_url", "agency_timezone"],
      [["zugx", "ÖBB GTFS", "https://zugx.legner.me", "Europe/Vienna"]],
    ),
    "routes.txt": csv(
      ["route_id", "agency_id", "route_short_name", "route_type"],
      [...trains].map(([name]) => [name, "zugx", name, 2]),
    ),
    "trips.txt": csv(
      ["route_id", "service_id", "trip_id", "trip_headsign"],
      trips.filter((t) => keep.has(t.id)).map((t) => [t.name, t.service, t.id, t.headsign]),
    ),
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
      stopTimes.map((s) => [
        s.trip_id,
        s.arrival_time,
        s.departure_time,
        s.stop_id,
        s.stop_sequence,
        s.pickup_type,
        s.drop_off_type,
      ]),
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
      stops.map((s) => [
        s.stop_id,
        s.stop_name,
        s.stop_lat,
        s.stop_lon,
        s.location_type,
        s.parent_station,
        s.platform_code,
      ]),
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
      rows<Record<string, string | number | null>>(db, "select * from calendar").map((c) => [
        c.service_id,
        c.monday,
        c.tuesday,
        c.wednesday,
        c.thursday,
        c.friday,
        c.saturday,
        c.sunday,
        c.start_date,
        c.end_date,
      ]),
    ),
    "calendar_dates.txt": csv(
      ["service_id", "date", "exception_type"],
      rows<Record<string, string | number | null>>(
        db,
        "select service_id, date, exception_type from calendar_dates",
      ).map((c) => [c.service_id, c.date, c.exception_type]),
    ),
  };
  mkdirSync(join(root, ".cache"), { recursive: true });
  writeFileSync(GTFS, zipSync(files));
  return { trains: trains.size, trips: trips.length };
}

async function main() {
  const t = timer();
  const g = writeRoutingGtfs();
  console.log(`route: routing GTFS with ${g.trains} trains, ${g.trips} trips (${t()})`);
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
  const map = readToml<Record<string, { id?: string }>>(
    join(root, "packages", "stations", "data", "gtfs-hafas-map.toml"),
    {},
  );
  const hafas: Record<string, string> = {};
  for (const [gid, e] of Object.entries(map)) if (e.id && !hafas[e.id]) hafas[e.id] = gid;
  writeFileSync(join(OUT, "stations.json"), JSON.stringify(hafas));
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
