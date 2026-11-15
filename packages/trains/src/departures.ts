// Build data/departures/<HAFAS id>.toml: every rail departure of the timetable year per station,
// from the open data GTFS — for the printed-style departure poster ("Abfahrt", /station/<id>/plan).
// Identical departures (time, train, destination, route, platform) are merged over the year; their
// running days are a base64 bitset, stored once per file in `days` and referenced by index.
// Run: vp run departures:build   (after stations:build, uses its GTFS → HAFAS station map)
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  dayFromIso,
  fetchFeeds,
  isRailRouteType,
  loadGtfs,
  parseTrainName,
  stationGroup,
  timer,
  timetableYear,
} from "@zugx/gtfs";
import type { GtfsHafasMap } from "@zugx/stations";
import { cleanGtfsName, cleanHafasName } from "@zugx/stations/match";
import { readToml, toToml } from "@zugx/toml";
import { feedYear } from "./build.ts";
import { encodeDays } from "./index.ts";

const DATA = join(import.meta.dirname, "..", "data", "departures");
const MAP_PATH = join(import.meta.dirname, "..", "..", "stations", "data", "gtfs-hafas-map.toml");
/** following stops listed per departure (the poster's "via" lines), at most */
const VIA_MAX = 8;

/** [minutes after midnight of the service day, category, number, destination id, following stop ids, days index, platform] */
export type DepartureRow = [number, string, string, string, string[], number, string | null];

async function main() {
  const t = timer();
  const g = await loadGtfs(await fetchFeeds(), {
    keepTrip: (tr, r) => !!r && isRailRouteType(r.type) && tr.shortName !== "",
  });
  const year = Number(process.env.TRAINS_YEAR) || feedYear(g);
  const tty = timetableYear(year);
  const begin = dayFromIso(tty.begin);
  const map = readToml<GtfsHafasMap>(MAP_PATH, {});
  const names = new Map<string, string>();
  const idOf = (gid: string) => {
    const e = map[gid];
    const id = e?.id ?? gid;
    if (!names.has(id))
      names.set(
        id,
        e?.id ? cleanHafasName(e.name ?? e.gtfs) : cleanGtfsName(g.stops.get(gid)?.name ?? gid),
      );
    return id;
  };

  // station id → departure key → { row, day indexes }
  const byStation = new Map<
    string,
    Map<string, { row: Omit<DepartureRow, 5>; days: Set<number> }>
  >();
  for (const trip of g.trips.values()) {
    const tn = parseTrainName(trip.shortName);
    if (!tn) continue;
    const sts = (g.stopTimes.get(trip.id) ?? []).filter(
      (s) => !(s.pickup === 1 && s.dropoff === 1),
    );
    if (sts.length < 2) continue;
    const days = (g.services.get(trip.serviceId) ?? [])
      .map((d) => d - begin)
      .filter((i) => i >= 0 && i < tty.days);
    if (!days.length) continue;
    const ids = sts.map((s) => idOf(stationGroup(g, s.stopId)));
    const dest = ids.at(-1)!;
    for (let k = 0; k + 1 < sts.length; k++) {
      const s = sts[k]!;
      if (s.pickup === 1) continue; // no boarding here
      const id = ids[k]!;
      if (!/^\d+$/.test(id)) continue; // stations without HAFAS id: no page to show it on
      const via = ids.slice(k + 1, -1).slice(0, VIA_MAX);
      const platform = g.stops.get(s.stopId)?.platform ?? null;
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
      source: "ÖBB GTFS (CC BY 4.0)",
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
