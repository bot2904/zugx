// Build data/stations.json: rail stations in Austria from open data GTFS, mapped to HAFAS ids.
// Run: vp run stations:build   (env: GTFS_ZIP, REMAP=1 to redo all HAFAS lookups)
import { join } from "node:path";
import {
  compareCategories,
  LONG_DISTANCE_CATEGORIES,
  fetchFeeds,
  isRailRouteType,
  loadGtfs,
  mapPool,
  parseTrainName,
  politeClient,
  isFinalHafasError,
  readJson,
  stationGroup,
  timer,
  writeJsonArray,
  writeJsonMap,
  type Gtfs,
} from "@zugx/gtfs";
import type { Location } from "@zugx/hafas";
import type { GtfsHafasEntry, GtfsHafasMap, Station } from "./index.ts";
import {
  cleanGtfsName,
  cleanHafasName,
  dhidCountry,
  normalizeName,
  scoreCandidates,
  type Scored,
} from "./match.ts";

const DATA = join(import.meta.dirname, "..", "data");
export const MAP_PATH = join(DATA, "gtfs-hafas-map.json");
const STATIONS_PATH = join(DATA, "stations.json");
/** retry unmatched stations after this many days */
const RETRY_DAYS = 14;

export interface GroupStats {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** rail departures over the whole feed */
  deps: number;
  /** long-distance departures (counted extra for the weight) */
  ldDeps: number;
  cats: Set<string>;
}

/** Aggregate rail usage per GTFS station group (parent station). */
export function railGroups(g: Gtfs): Map<string, GroupStats> {
  const groups = new Map<string, GroupStats & { n: number; sLat: number; sLon: number }>();
  for (const trip of g.trips.values()) {
    const sts = g.stopTimes.get(trip.id);
    if (!sts) continue;
    const days = g.services.get(trip.serviceId)?.length ?? 0;
    const cat = parseTrainName(trip.shortName)?.cat;
    const ld = LONG_DISTANCE_CATEGORIES.includes(cat ?? "");
    for (const [i, st] of sts.entries()) {
      if (st.pickup === 1 && st.dropoff === 1) continue;
      const gid = stationGroup(g, st.stopId);
      let s = groups.get(gid);
      if (!s) {
        const parent = g.stops.get(gid);
        s = {
          id: gid,
          name: parent?.name ?? g.stops.get(st.stopId)?.name ?? gid,
          lat: 0,
          lon: 0,
          deps: 0,
          ldDeps: 0,
          cats: new Set(),
          n: 0,
          sLat: 0,
          sLon: 0,
        };
        groups.set(gid, s);
      }
      const stop = g.stops.get(st.stopId);
      if (stop && Number.isFinite(stop.lat) && stop.lat !== 0) {
        s.n++;
        s.sLat += stop.lat;
        s.sLon += stop.lon;
      }
      if (cat) s.cats.add(cat);
      if (i < sts.length - 1 && st.pickup !== 1) {
        s.deps += days;
        if (ld) s.ldDeps += days;
      }
    }
  }
  // coordinates: centroid of the rail platforms actually used (the parent may include bus stops)
  for (const s of groups.values()) {
    if (s.n) {
      s.lat = s.sLat / s.n;
      s.lon = s.sLon / s.n;
    } else {
      const p = g.stops.get(s.id);
      s.lat = p?.lat ?? 0;
      s.lon = p?.lon ?? 0;
    }
  }
  return groups;
}

const round6 = (x: number) => Math.round(x * 1e6) / 1e6;

/** Find the HAFAS station for a GTFS station group. */
export async function lookup(
  client: ReturnType<typeof politeClient>["client"],
  s: GroupStats,
): Promise<Scored | undefined> {
  const accept = (c: Scored | undefined) =>
    c && ((c.dist <= 600 && (c.sim >= 0.3 || c.dist <= 150)) || (c.dist <= 2000 && c.sim >= 0.75))
      ? c
      : undefined;
  let near: Location[] = [];
  try {
    near = await client.nearby(s.lat, s.lon, 600, 30);
  } catch (e) {
    if (!isFinalHafasError(e)) throw e;
  }
  const geo = accept(scoreCandidates(s, near)[0]);
  if (geo && geo.sim >= 0.5) return geo;
  // weak or no geo match: also try by name
  let byName: Location[] = [];
  try {
    byName = await client.locations(cleanGtfsName(s.name), 10);
  } catch (e) {
    if (!isFinalHafasError(e)) throw e;
  }
  return accept(scoreCandidates(s, [...near, ...byName])[0]) ?? geo;
}

export async function updateMap(
  groups: Iterable<GroupStats>,
  log: (msg: string) => void = console.log,
): Promise<GtfsHafasMap> {
  const old = readJson<GtfsHafasMap>(MAP_PATH, {});
  const todayDate = Temporal.Now.plainDateISO("Europe/Vienna");
  const today = todayDate.toString();
  const retryBefore = todayDate.subtract({ days: RETRY_DAYS }).toString();
  const map: GtfsHafasMap = {};
  const todo: GroupStats[] = [];
  for (const s of groups) {
    const e = old[s.id];
    const fresh = e && (e.id !== null || (e.checked ?? "") >= retryBefore);
    if (e && fresh && !process.env.REMAP) map[s.id] = { ...e, gtfs: s.name };
    else todo.push(s);
  }
  log(`map: ${Object.keys(map).length} cached, ${todo.length} to look up`);
  if (!todo.length) return map;
  const t = timer();
  const polite = politeClient({ log });
  let done = 0;
  await mapPool(todo, 3, async (s) => {
    const best = await lookup(polite.client, s);
    const entry: GtfsHafasEntry = best
      ? {
          id: best.loc.id,
          name: best.loc.name,
          lat: round6(best.loc.lat!),
          lon: round6(best.loc.lon!),
          p: best.loc.products ?? 0,
          d: Math.round(best.dist),
          gtfs: s.name,
        }
      : { id: null, gtfs: s.name, checked: today };
    map[s.id] = entry;
    if (!best)
      log(`map: no match for ${s.id} "${s.name}" (${s.lat.toFixed(5)}, ${s.lon.toFixed(5)})`);
    if (++done % 50 === 0) {
      log(`map: ${done}/${todo.length} (${polite.count} requests, ${t()})`);
      await writeJsonMap(MAP_PATH, map);
    }
  });
  log(`map: looked up ${todo.length} stations with ${polite.count} requests in ${t()}`);
  await writeJsonMap(MAP_PATH, map);
  return map;
}

export function buildStations(groups: Map<string, GroupStats>, map: GtfsHafasMap): Station[] {
  const byId = new Map<
    string,
    { e: GtfsHafasEntry; deps: number; ldDeps: number; cats: Set<string>; gtfsNames: Set<string> }
  >();
  for (const s of groups.values()) {
    if (dhidCountry(s.id) !== "at") continue;
    const e = map[s.id];
    if (!e?.id) continue;
    let x = byId.get(e.id);
    if (!x) byId.set(e.id, (x = { e, deps: 0, ldDeps: 0, cats: new Set(), gtfsNames: new Set() }));
    x.deps += s.deps;
    x.ldDeps += s.ldDeps;
    for (const c of s.cats) x.cats.add(c);
    x.gtfsNames.add(s.name);
  }
  // weight: departures, long-distance ones counted 5×; log scale, cubed to spread the top end
  const score = (x: { deps: number; ldDeps: number }) => x.deps + 4 * x.ldDeps;
  const maxLog = Math.log1p(Math.max(1, ...[...byId.values()].map(score)));
  const out: Station[] = [];
  for (const [id, x] of byId) {
    const name = cleanHafasName(x.e.name ?? "");
    // aliases: GTFS names that the client search wouldn't find via the HAFAS name anyway
    const words = new Set(normalizeName(name).split(" "));
    const alias = new Set<string>();
    for (const n of x.gtfsNames) {
      const a = cleanGtfsName(n);
      if (
        !normalizeName(a)
          .split(" ")
          .every((w) => words.has(w))
      )
        alias.add(a);
    }
    const st: Station = {
      id,
      name,
      lat: x.e.lat!,
      lon: x.e.lon!,
      p: [...x.cats].sort(compareCategories),
      w: Math.max(1, Math.round(1000 * (Math.log1p(score(x)) / maxLog) ** 3)),
    };
    if (alias.size) st.alias = [...alias].sort();
    out.push(st);
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

async function main() {
  const total = timer();
  const feeds = await fetchFeeds();
  const g = await loadGtfs(feeds, { keepTrip: (_t, r) => !!r && isRailRouteType(r.type) });
  const groups = railGroups(g);
  const at = [...groups.values()].filter((s) => dhidCountry(s.id) === "at").length;
  console.log(
    `stations: ${groups.size} rail station groups (${at} in Austria, ${groups.size - at} abroad)`,
  );
  const map = await updateMap(groups.values());
  const unmapped = [...groups.values()].filter((s) => !map[s.id]?.id);
  const far = [...groups.values()].filter((s) => (map[s.id]?.d ?? 0) > 400);
  for (const s of unmapped) console.log(`unmapped: ${s.id} "${s.name}" (${s.deps} deps)`);
  for (const s of far)
    console.log(
      `far match: ${s.id} "${s.name}" → ${map[s.id]!.id} "${map[s.id]!.name}" ${map[s.id]!.d} m`,
    );
  const stations = buildStations(groups, map);
  const text = await writeJsonArray(STATIONS_PATH, stations);
  console.log(
    `stations: mapped ${groups.size - unmapped.length}/${groups.size} groups ` +
      `(${unmapped.filter((s) => dhidCountry(s.id) === "at").length} unmapped in Austria); ` +
      `wrote ${stations.length} stations, ${(text.length / 1024).toFixed(0)} KiB → ${STATIONS_PATH} in ${total()}`,
  );
}

if (import.meta.main) await main();
