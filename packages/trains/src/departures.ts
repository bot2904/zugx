// Build data/departures/<HAFAS id>.toml: every rail departure of the timetable year per station,
// from the open data GTFS — for the printed-style departure poster ("Abfahrt", /station/<id>/plan).
// Identical departures (time, train, destination, route, platform) are merged over the year; their
// running days are a base64 bitset, stored once per file in `days` and referenced by index.
// Reads the local SQLite (vp run db:build).
// Run: vp run departures:build   (after stations:build, uses its GTFS → HAFAS station map)
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  COUNTRIES,
  currentCountry,
  dataDir,
  dayFromIso,
  parseTrainName,
  timer,
  timetableYear,
} from "@zugx/gtfs";
import { openZugxDb, RAIL_ROUTE_TYPES, rows, serviceDays } from "@zugx/db/query";
import type { GtfsHafasMap } from "@zugx/stations";
import { cleanGtfsName, cleanHafasName } from "@zugx/stations/match";
import { readToml, toToml } from "@zugx/toml";
import { feedYear } from "./build.ts";
import { encodeDays } from "./index.ts";

const COUNTRY = currentCountry();
/**
 * One feed per station's plan (two plans of a station would compete in the app): a configured
 * country's stations from its own feed, stations abroad (Zagreb, München …) from the first
 * country in countries.toml
 */
const PRIMARY = Object.keys(COUNTRIES)[0];
const planHere = (hafasId: string) => {
  const own = Object.values(COUNTRIES).find((c) => hafasId.startsWith(c.uic));
  return own ? own.id === COUNTRY.id : COUNTRY.id === PRIMARY;
};
const DATA = join(dataDir("trains", COUNTRY), "departures");
const MAP_PATH = join(dataDir("stations", COUNTRY), "gtfs-hafas-map.toml");
/** following stops listed per departure (the poster's "via" lines), at most */
const VIA_MAX = 8;

/** [minutes after midnight of the service day, category, number, destination id, following stop ids, days index, platform] */
export type DepartureRow = [number, string, string, string, string[], number, string | null];

async function main() {
  const t = timer();
  const db = openZugxDb();
  const services = serviceDays(db);
  const year = Number(process.env.TRAINS_YEAR) || feedYear({ services });
  const tty = timetableYear(year);
  const begin = dayFromIso(tty.begin);
  const map = readToml<GtfsHafasMap>(MAP_PATH, {});
  // stops: station group (parent station, else the stop itself), name, platform
  const stops = new Map(
    rows<{ id: string; name: string; parent: string | null; platform: string | null }>(
      db,
      "select stop_id id, stop_name name, parent_station parent, platform_code platform from stops",
    ).map((s) => [s.id, s]),
  );
  const group = (id: string) => stops.get(id)?.parent || id;
  const names = new Map<string, string>();
  /** ids that are HAFAS station ids (the others are GTFS ids of unmatched stops) */
  const hafasIds = new Set(Object.values(map).flatMap((e) => (e.id ? [e.id] : [])));
  const idOf = (gid: string) => {
    const e = map[gid];
    const id = e?.id ?? gid;
    if (!names.has(id))
      names.set(
        id,
        e?.id ? cleanHafasName(e.name ?? e.gtfs) : cleanGtfsName(stops.get(gid)?.name ?? gid),
      );
    return id;
  };
  // rail trips with a train name, in file order; their stop times in stop_sequence order
  const trips = rows<{ id: string; name: string; service: string }>(
    db,
    `select t.trip_id id, trim(t.trip_short_name) name, t.service_id service
       from trips t join routes r using (route_id)
      where ${RAIL_ROUTE_TYPES} and trim(coalesce(t.trip_short_name, '')) <> ''
      order by t.rowid`,
  );
  type St = { stopId: string; dep: number; pickup: number; dropoff: number };
  const stopTimes = new Map<string, St[]>();
  for (const r of rows<St & { trip: string }>(
    db,
    `select st.trip_id trip, st.stop_id stopId,
            coalesce(st.departure_timestamp, st.arrival_timestamp) dep,
            coalesce(st.pickup_type, 0) pickup, coalesce(st.drop_off_type, 0) dropoff
       from stop_times st join trips t using (trip_id) join routes r using (route_id)
      where ${RAIL_ROUTE_TYPES} and trim(coalesce(t.trip_short_name, '')) <> ''
      order by st.trip_id, st.stop_sequence`,
  )) {
    const list = stopTimes.get(r.trip) ?? [];
    list.push(r);
    stopTimes.set(r.trip, list);
  }

  // station id → departure key → { row, day indexes }
  const byStation = new Map<
    string,
    Map<string, { row: Omit<DepartureRow, 5>; days: Set<number> }>
  >();
  for (const trip of trips) {
    const tn = parseTrainName(trip.name);
    if (!tn) continue;
    const sts = (stopTimes.get(trip.id) ?? []).filter((s) => !(s.pickup === 1 && s.dropoff === 1));
    if (sts.length < 2) continue;
    const days = (services.get(trip.service) ?? [])
      .map((d) => d - begin)
      .filter((i) => i >= 0 && i < tty.days);
    if (!days.length) continue;
    const ids = sts.map((s) => idOf(group(s.stopId)));
    const dest = ids.at(-1)!;
    for (let k = 0; k + 1 < sts.length; k++) {
      const s = sts[k]!;
      if (s.pickup === 1) continue; // no boarding here
      const id = ids[k]!;
      if (!hafasIds.has(id)) continue; // stations without HAFAS id: no page to show it on
      if (!planHere(id)) continue; // the station's plan comes from another feed
      const via = ids.slice(k + 1, -1).slice(0, VIA_MAX);
      const platform = stops.get(s.stopId)?.platform || null;
      const row = [Math.round(s.dep / 60), tn.cat, tn.nr, dest, via, platform] as const;
      const key = JSON.stringify(row);
      let m = byStation.get(id);
      if (!m) byStation.set(id, (m = new Map()));
      let e = m.get(key);
      if (!e) m.set(key, (e = { row: row as unknown as Omit<DepartureRow, 5>, days: new Set() }));
      for (const d of days) e.days.add(d);
    }
  }

  mkdirSync(DATA, { recursive: true });
  for (const f of readdirSync(DATA)) if (f.endsWith(".toml")) rmSync(join(DATA, f));
  let total = 0;
  for (const [id, m] of byStation) {
    const dayTable: string[] = [];
    const dayIdx = new Map<string, number>();
    const deps: DepartureRow[] = [];
    const used = new Set<string>();
    for (const { row, days } of m.values()) {
      const b64 = encodeDays(days, tty.days);
      let di = dayIdx.get(b64);
      if (di === undefined) dayIdx.set(b64, (di = dayTable.push(b64) - 1));
      const [min, cat, nr, dest, via, platform] = row as unknown as [
        number,
        string,
        string,
        string,
        string[],
        string | null,
      ];
      deps.push([min, cat, nr, dest, via, di, platform]);
      used.add(dest);
      for (const v of via) used.add(v);
    }
    deps.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]) || a[2].localeCompare(b[2]));
    total += deps.length;
    // one departure per line (diffable); before the [names] section, which TOML would otherwise
    // take the rows for
    const head = toToml({
      id,
      name: names.get(id) ?? id,
      year,
      begin: tty.begin,
      end: tty.end,
      source: `${COUNTRY.licence.source} (${COUNTRY.licence.name})`,
      days: dayTable,
    });
    const rows = deps.map((r) => `  ${JSON.stringify(r.map((x) => x ?? ""))},`).join("\n");
    const tail = toToml({
      names: Object.fromEntries([...used].sort().map((u) => [u, names.get(u) ?? u])),
    });
    writeFileSync(join(DATA, `${id}.toml`), `${head.trimEnd()}\ndeps = [\n${rows}\n]\n\n${tail}`);
  }
  console.log(`departures: ${byStation.size} stations, ${total} departure rows → ${DATA} (${t()})`);
}

if (import.meta.main) await main();
