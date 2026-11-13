// Build data/trains-<year>.json (long-distance + night) and data/trains-<year>.full.json (all trains)
// from open data GTFS. Run after stations:build (uses its GTFS → HAFAS station map).
// Run: vp run trains:build   (env: GTFS_ZIP, TRAINS_YEAR, NAMES=0 to skip HAFAS name lookups)
import { join } from "node:path";
import {
  dayFromIso,
  fetchFeeds,
  isoDay,
  isRailRouteType,
  isFinalHafasError,
  loadGtfs,
  mapPool,
  parseTrainName,
  politeClient,
  readJson,
  stationGroup,
  timer,
  timetableYear,
  writeJsonMap,
  type Gtfs,
  type Trip,
} from "@zugx/gtfs";
import type { GtfsHafasMap } from "@zugx/stations";
import { cleanGtfsName, cleanHafasName } from "@zugx/stations/match";
import { writeFile } from "node:fs/promises";
import {
  decodeDays,
  encodeDays,
  isLongDistance,
  type StopRef,
  type TrainEntry,
  type TrainIndex,
} from "./index.ts";

const DATA = join(import.meta.dirname, "..", "data");
const MAP_PATH = join(import.meta.dirname, "..", "..", "stations", "data", "gtfs-hafas-map.json");
const MAX_VIA = 6;
/** hubs: the HUBS_ALL busiest stations in Austria, the HUBS_LD busiest by long-distance stops, HUBS_ABROAD abroad */
const HUBS_ALL = 60;
const HUBS_LD = 40;
const HUBS_ABROAD = 25;
/** product names HAFAS sometimes puts in the train name remark — not train names */
const GENERIC_NAMES =
  /^(railjet( xpress)?|nightjet|euronight|eurocity|intercity(.express)?|interregio|westbahn|ice)$/i;

const OPERATORS: [RegExp, string][] = [
  [/^(OEBB|ÖBB)/i, "oebb"],
  [/montafonerbahn/i, "montafonerbahn"],
  [/city air terminal|city airport train/i, "cat"],
  [/westbahn/i, "westbahn"],
  [/graz-k(ö|oe)flacher|gkb/i, "gkb"],
  [/steiermarkbahn|stlb/i, "stb"],
  [/salzburg ag|salzburger lokalbahn|slb/i, "slb"],
  [/zillertal/i, "zb"],
  [/n(ö|oe)vog|niederösterreichische verkehrsorganisation/i, "noevog"],
  [/raab|gysev/i, "gysev"],
  [/wiener lokalbahnen/i, "wlb"],
  [/stern.*hafferl/i, "sth"],
];

export function operatorSlug(agencyName: string): string {
  for (const [re, slug] of OPERATORS) if (re.test(agencyName)) return slug;
  return (
    agencyName
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .split(/\s+/)[0]
      ?.replace(/[^a-z0-9]/g, "") || "other"
  );
}

interface StopEv {
  g: string;
  arr: number;
  dep: number;
}

/** Chain the trips a train runs on one day (segments in GTFS) into one stop sequence. */
export function chainTrips(trips: StopEv[][]): StopEv[] {
  const sorted = trips.filter((t) => t.length).sort((a, b) => a[0]!.dep - b[0]!.dep);
  const out: StopEv[] = [];
  for (const t of sorted) {
    const last = out.at(-1);
    if (last && last.g === t[0]!.g) {
      last.dep = t[0]!.dep;
      out.push(...t.slice(1).map((s) => ({ ...s })));
    } else out.push(...t.map((s) => ({ ...s })));
  }
  return out;
}

export function stopRef(id: string, secs: number): StopRef {
  const day = Math.floor(secs / 86_400);
  const m = Math.floor((secs % 86_400) / 60);
  const hhmm = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return day > 0 ? [id, hhmm, day] : [id, hhmm];
}

export function compareTrains(a: TrainEntry, b: TrainEntry): number {
  if (a.cat !== b.cat) return a.cat < b.cat ? -1 : 1;
  const na = parseInt(a.nr, 10);
  const nb = parseInt(b.nr, 10);
  if (na !== nb) return na - nb;
  if (a.nr !== b.nr) return a.nr < b.nr ? -1 : 1;
  return a.op < b.op ? -1 : a.op > b.op ? 1 : 0;
}

/** Guess the timetable year of a feed: the year most service days fall into. */
function feedYear(g: Gtfs): number {
  const votes = new Map<number, number>();
  for (const days of g.services.values())
    for (const d of days) {
      const iso = isoDay(d);
      let y = +iso.slice(0, 4);
      if (iso >= timetableYear(y + 1).begin) y++;
      votes.set(y, (votes.get(y) ?? 0) + 1);
    }
  return (
    [...votes].sort((a, b) => b[1] - a[1])[0]?.[0] ??
    Temporal.Now.plainDateISO("Europe/Vienna").year
  );
}

interface Train {
  op: string;
  cat: string;
  nr: string;
  trips: Trip[];
}

interface NameEntry {
  name?: string;
  checked: string;
}

/** Look up train names (HAFAS remark code "ZN" = Zugname) for trains running from today on. */
async function fetchNames(
  trains: { key: string; cat: string; nr: string; date?: string }[],
  path: string,
  log: (msg: string) => void,
): Promise<Record<string, NameEntry>> {
  const cache = readJson<Record<string, NameEntry>>(path, {});
  const todo = trains.filter((t) => t.date && !cache[t.key]);
  const notRunning = trains.filter((t) => !t.date && !cache[t.key]).length;
  log(
    `names: ${trains.length - todo.length - notRunning} cached, ${todo.length} to look up` +
      (notRunning ? `, ${notRunning} without running days (skipped)` : ""),
  );
  if (!todo.length || process.env.NAMES === "0") return cache;
  const polite = politeClient({ log });
  const t = timer();
  const today = Temporal.Now.plainDateISO("Europe/Vienna").toString();
  let done = 0;
  let found = 0;
  await mapPool(todo, 3, async (tr) => {
    let name: string | undefined;
    try {
      const res = await polite.client.request("JourneyMatch", {
        input: `${tr.cat} ${tr.nr}`,
        date: tr.date!.replaceAll("-", ""),
        onlyCR: false,
      });
      const c = res?.common ?? {};
      for (const j of res?.jnyL ?? []) {
        const ctx = c.prodL?.[j.prodX]?.prodCtx ?? {};
        if ((ctx.catOutS ?? "").trim() !== tr.cat || String(ctx.num ?? "").trim() !== tr.nr)
          continue;
        for (const m of j.msgL ?? []) {
          const rem = m.type === "REM" ? c.remL?.[m.remX] : undefined;
          if (rem?.code === "ZN" && rem.txtN) name = String(rem.txtN).trim();
        }
        if (name) break;
      }
    } catch (e) {
      if (!isFinalHafasError(e)) throw e;
    }
    cache[tr.key] = name ? { name, checked: today } : { checked: today };
    if (name) found++;
    if (++done % 50 === 0) {
      log(`names: ${done}/${todo.length}, ${found} named (${t()})`);
      await writeJsonMap(path, cache);
    }
  });
  log(
    `names: looked up ${todo.length} trains (${found} named) with ${polite.count} requests in ${t()}`,
  );
  await writeJsonMap(path, cache);
  return cache;
}

async function writeIndex(path: string, idx: TrainIndex): Promise<number> {
  const { trains, stations, ...head } = idx;
  const st = Object.keys(stations)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${JSON.stringify(stations[k])}`)
    .join(",\n");
  const text =
    `${JSON.stringify(head).slice(0, -1)},\n"stations":{\n${st}\n},\n"trains":[\n` +
    `${trains.map((t) => JSON.stringify(t)).join(",\n")}\n]}\n`;
  await writeFile(path, text);
  return text.length;
}

async function main() {
  const total = timer();
  const log = console.log;
  const feeds = await fetchFeeds();
  const g = await loadGtfs(feeds, {
    keepTrip: (t, r) => !!r && isRailRouteType(r.type) && t.shortName !== "",
  });
  const year = Number(process.env.TRAINS_YEAR) || feedYear(g);
  const tty = timetableYear(year);
  const begin = dayFromIso(tty.begin);
  const nDays = tty.days;
  log(`trains: timetable year ${year} = ${tty.begin} … ${tty.end} (${nDays} days)`);

  const map = readJson<GtfsHafasMap>(MAP_PATH, {});
  if (!Object.keys(map).length)
    log(`trains: WARNING no station map at ${MAP_PATH}, run stations:build first`);

  // ---- group trips into trains ----
  const trains = new Map<string, Train>();
  let unparsed = 0;
  for (const trip of g.trips.values()) {
    const tn = parseTrainName(trip.shortName);
    if (!tn) {
      unparsed++;
      continue;
    }
    const route = g.routes.get(trip.routeId);
    const op = operatorSlug(g.agencies.get(route?.agencyId ?? "")?.name ?? "");
    const key = `${op}|${tn.cat}|${tn.nr}`;
    let t = trains.get(key);
    if (!t) trains.set(key, (t = { op, ...tn, trips: [] }));
    t.trips.push(trip);
  }
  log(
    `trains: ${g.trips.size} rail trips → ${trains.size} trains (${unparsed} trips without a train number)`,
  );

  // ---- hubs (for "via"): the busiest stations by all / by long-distance stops ----
  const deps = new Map<string, number>();
  const ldDeps = new Map<string, number>();
  for (const trip of g.trips.values()) {
    const n = g.services.get(trip.serviceId)?.length ?? 0;
    const ld = isLongDistance({ cat: parseTrainName(trip.shortName)?.cat ?? "" });
    const sts = g.stopTimes.get(trip.id) ?? [];
    sts.forEach((st) => {
      if (st.pickup === 1 && st.dropoff === 1) return;
      const gid = stationGroup(g, st.stopId);
      deps.set(gid, (deps.get(gid) ?? 0) + n);
      if (ld) ldDeps.set(gid, (ldDeps.get(gid) ?? 0) + n);
    });
  }
  const abroad = (gid: string) => !/^P?at:/.test(gid);
  const nth = (m: Map<string, number>, n: number, filter: (gid: string) => boolean) =>
    [...m].filter(([gid]) => filter(gid)).sort((a, b) => b[1] - a[1])[n - 1]?.[1] ?? Infinity;
  const hubAll = nth(deps, HUBS_ALL, (gid) => !abroad(gid));
  const hubLd = nth(ldDeps, HUBS_LD, (gid) => !abroad(gid));
  // the feed only has the trains ÖBB runs abroad, so rank foreign stations separately
  const hubLdAbroad = nth(ldDeps, HUBS_ABROAD, abroad);
  /** hub score (> 0 for hubs, higher = more important); long-distance trains only use long-distance traffic */
  const hubScore = (gid: string, longDistance: boolean) => {
    const l = (ldDeps.get(gid) ?? 0) / (abroad(gid) ? hubLdAbroad : hubLd);
    const a = longDistance || abroad(gid) ? 0 : (deps.get(gid) ?? 0) / hubAll;
    return a >= 1 || l >= 1 ? Math.max(a, l) : 0;
  };

  // ---- station ids + names ----
  const unmapped = new Map<string, number>();
  const stationNames = new Map<string, string>();
  const hafasId = (gid: string): string => {
    const e = map[gid];
    if (e?.id) {
      if (!stationNames.has(e.id)) stationNames.set(e.id, cleanHafasName(e.name ?? e.gtfs));
      return e.id;
    }
    unmapped.set(gid, (unmapped.get(gid) ?? 0) + 1);
    stationNames.set(gid, cleanGtfsName(g.stops.get(gid)?.name ?? gid));
    return gid;
  };

  // ---- per train: days, patterns ----
  const entries: TrainEntry[] = [];
  let noAustria = 0;
  for (const t of trains.values()) {
    const austrian = t.trips.some((tr) =>
      (g.stopTimes.get(tr.id) ?? []).some((st) => st.stopId.startsWith("at:")),
    );
    if (!austrian) {
      noAustria++;
      continue;
    }
    // day index → trips running that day
    const byDay = new Map<number, string[]>();
    for (const tr of t.trips) {
      for (const d of g.services.get(tr.serviceId) ?? []) {
        const i = d - begin;
        if (i < 0 || i >= nDays) continue;
        let l = byDay.get(i);
        if (!l) byDay.set(i, (l = []));
        l.push(tr.id);
      }
    }
    if (!byDay.size) continue;
    // identical trip combinations → one chained stop sequence
    const combos = new Map<string, { trips: string[]; days: number }>();
    for (const ids of byDay.values()) {
      ids.sort();
      const k = ids.join(" ");
      const c = combos.get(k);
      if (c) c.days++;
      else combos.set(k, { trips: ids, days: 1 });
    }
    const patterns = new Map<string, { days: number; best: number; stops: StopEv[] }>();
    for (const c of combos.values()) {
      const stops = chainTrips(
        c.trips.map((id) =>
          (g.stopTimes.get(id) ?? [])
            .filter((st) => !(st.pickup === 1 && st.dropoff === 1))
            .map((st) => ({ g: stationGroup(g, st.stopId), arr: st.arr, dep: st.dep })),
        ),
      );
      if (stops.length < 2) continue;
      const pk = stops.map((s) => s.g).join(">");
      const p = patterns.get(pk);
      if (!p) patterns.set(pk, { days: c.days, best: c.days, stops });
      else {
        p.days += c.days;
        if (c.days > p.best) {
          p.best = c.days;
          p.stops = stops;
        }
      }
    }
    const main = [...patterns.values()].sort((a, b) => b.days - a.days)[0];
    if (!main) continue;
    if (process.env.DEBUG_TRAIN === `${t.cat} ${t.nr}`) {
      for (const p of [...patterns.values()].sort((a, b) => b.days - a.days))
        log(
          `debug: ${p.days} days: ` +
            p.stops
              .map(
                (s) =>
                  `${g.stops.get(s.g)?.name ?? s.g} [${hubScore(s.g, isLongDistance(t)).toFixed(2)}]`,
              )
              .join(" → "),
        );
    }
    const first = main.stops[0]!;
    const last = main.stops.at(-1)!;
    const fromId = hafasId(first.g);
    const toId = hafasId(last.g);
    const mids = main.stops.slice(1, -1);
    const hubs = new Set(
      mids
        .map((s, i) => ({ g: s.g, i, w: hubScore(s.g, isLongDistance(t)) }))
        .filter((x) => x.w > 0)
        .sort((a, b) => b.w - a.w || a.i - b.i)
        .slice(0, MAX_VIA)
        .map((x) => x.i),
    );
    const via: string[] = [];
    mids.forEach((s, i) => {
      if (!hubs.has(i)) return;
      const id = hafasId(s.g);
      if (id !== fromId && id !== toId && !via.includes(id)) via.push(id);
    });
    // all intermediate stops of the main route (for "trains stopping at X" and text search)
    const stops: string[] = [];
    for (const s of mids) {
      const id = hafasId(s.g);
      if (id !== fromId && id !== toId && stops.at(-1) !== id) stops.push(id);
    }
    const dayIdx = [...byDay.keys()].sort((a, b) => a - b);
    const e: TrainEntry = {
      op: t.op,
      cat: t.cat,
      nr: t.nr,
      from: stopRef(fromId, first.dep),
      to: stopRef(toId, last.arr),
      via,
      stops,
      days: encodeDays(dayIdx, nDays),
      n: dayIdx.length,
      first: isoDay(begin + dayIdx[0]!),
      last: isoDay(begin + dayIdx.at(-1)!),
    };
    if (patterns.size > 1) e.var = patterns.size;
    entries.push(e);
  }
  entries.sort(compareTrains);
  log(`trains: ${entries.length} trains with Austrian stops (${noAustria} without, skipped)`);

  // ---- names (long-distance only) ----
  const today = Temporal.Now.plainDateISO("Europe/Vienna").toString();
  const namesPath = join(DATA, `names-${year}.json`);
  const ldTodo = entries.filter(isLongDistance);
  const names = await fetchNames(
    ldTodo.map((e) => {
      // running day closest to today: HAFAS only knows a window of a few months around today
      const ds = [...decodeDays(e.days, tty.begin)].sort();
      const date = ds.find((d) => d >= today) ?? ds.at(-1);
      return { key: `${e.cat} ${e.nr}`, cat: e.cat, nr: e.nr, date };
    }),
    namesPath,
    log,
  );
  const all = entries.map((e): TrainEntry => {
    const raw = isLongDistance(e) ? names[`${e.cat} ${e.nr}`]?.name : undefined;
    const name = raw && !GENERIC_NAMES.test(raw) ? raw : undefined;
    if (!name) return e;
    const { op, cat, nr, ...rest } = e;
    return { op, cat, nr, name, ...rest }; // keep name right after nr
  });
  const ld = all.filter(isLongDistance);

  // ---- write ----
  const source =
    feeds.length === 1 && feeds[0]!.source.includes("oebb.at")
      ? `ÖBB GTFS ${year} (CC BY 4.0)`
      : feeds.map((f) => f.source.split("/").pop()).join(" + ");
  const write = async (file: string, list: TrainEntry[]) => {
    const ids = new Set<string>();
    for (const e of list) {
      ids.add(e.from[0]);
      ids.add(e.to[0]);
      for (const v of e.stops) ids.add(v);
    }
    const stations: Record<string, string> = {};
    for (const id of [...ids].sort()) stations[id] = stationNames.get(id) ?? id;
    const path = join(DATA, file);
    const size = await writeIndex(path, {
      year,
      begin: tty.begin,
      end: tty.end,
      source,
      stations,
      trains: list,
    });
    log(
      `trains: wrote ${list.length} trains, ${ids.size} stations, ${(size / 1024).toFixed(0)} KiB → ${path}`,
    );
  };
  await write(`trains-${year}.full.json`, all);
  await write(`trains-${year}.json`, ld);
  if (unmapped.size) {
    log(`trains: ${unmapped.size} stations without HAFAS id (GTFS id used instead):`);
    for (const [gid, n] of [...unmapped].sort((a, b) => b[1] - a[1]))
      log(`  unmapped: ${gid} "${g.stops.get(gid)?.name ?? ""}" (${n} refs)`);
  }
  const named = ld.filter((e) => e.name).length;
  log(`trains: ${named}/${ld.length} long-distance trains named; done in ${total()}`);
}

if (import.meta.main) await main();
