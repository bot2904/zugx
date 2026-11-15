/**
 * Build: ÖBB GTFS → data/netz.toml, data/nge.json (Netzgrafik-Editor), data/corridors/*.toml
 *
 *   vpx packages/netz/src/build.ts [--day=2026-03-10] [--cats=RJX,RJ,…]
 *
 * GTFS source: env GTFS_DIR (unzipped) or GTFS_ZIP, else `<repo>/.cache/`
 * (downloaded if missing).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { readToml, toToml } from "@zugx/toml";
import { linesThrough, signalLookup, speedLookup } from "@zugx/vzg/speed";
import type { VzgLine } from "@zugx/vzg";
import {
  buildCorridor,
  corridorToml,
  CORRIDOR_ALIASES,
  CORRIDORS,
  type SpeedLookup,
} from "./corridors.ts";
import { feedPeriod, loadFeed, loadShapes, parentDhid, serviceDays } from "./gtfs.ts";
import { openZugxDb, recordSource } from "@zugx/db/query";
import { buildNetz } from "./netz.ts";
import { trafficDensity } from "./density.ts";
import { corridorKmAt, lineFinder, linePosAt, shapeLine } from "./via.ts";
import {
  corridorTracks,
  pairTrips,
  pieceTracks,
  trackLookup,
  wayTracks,
  type RailWays,
} from "./tracks.ts";
import { toNge } from "./nge.ts";
import { nodeCandidates, NODES } from "./nodes.ts";
import type { CorridorIndex } from "./types.ts";

/** Regular Tuesday outside school holidays. */
export const DEFAULT_DAY = "2026-03-10";
/** Netzgrafik day types: reference days (same week, no holidays) and output file suffixes. */
export const DAY_TYPES = [
  { type: "weekday", day: DEFAULT_DAY, suffix: "" },
  { type: "saturday", day: "2026-03-14", suffix: "-saturday" },
  { type: "sunday", day: "2026-03-15", suffix: "-sunday" },
] as const;
/** Takt-relevant categories (night trains and R/S are left out of the Netzgrafik). */
export const DEFAULT_CATS = ["RJX", "RJ", "ICE", "EC", "IC", "D", "IR", "CJX", "REX"];
export const SOURCE = "ÖBB GTFS 2026 (CC BY 4.0)";

const pkg = join(import.meta.dirname, "..");
const root = join(pkg, "..", "..");
const out = join(pkg, "data");

function loadHafasMap(): Map<string, string> | undefined {
  const p = join(root, "packages", "stations", "data", "gtfs-hafas-map.toml");
  if (!existsSync(p)) return undefined;
  const raw = readToml<Record<string, unknown>>(p, {});
  const map = new Map<string, string>();
  for (const [k, v] of Object.entries(raw)) {
    const id = typeof v === "string" ? v : v && typeof v === "object" && "id" in v ? v.id : null;
    if (typeof id !== "string" && typeof id !== "number") continue;
    map.set(k, String(id));
    // stops without parent station (e.g. Küb: `at:43:8764:0:1`) are stations under their derived
    // parent DHID in the corridors (`Pat:43:8764`, see loadFeed)
    if (k.startsWith("at:")) {
      const parent = parentDhid(k);
      if (!map.has(parent)) map.set(parent, String(id));
    }
  }
  return map;
}

/** top speed per category (km/h) for the passing-time weighting: assumptions, see docs */
const VMAX: Record<string, number> = {
  RJX: 230,
  RJ: 230,
  ICE: 250,
  EC: 200,
  IC: 200,
  ECE: 200,
  WB: 200,
  NJ: 160,
  EN: 160,
  D: 160,
  CJX: 160,
  REX: 160,
  R: 140,
  S: 140,
};

/**
 * Permitted speeds between stations from the VzG data (packages/vzg/data, OSM, ODbL), stations
 * linked by position.
 */
function loadVzg(): VzgLine[] {
  const dir = join(root, "packages", "vzg", "data");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".toml") && f !== "index.toml")
    .map((f) => readToml<VzgLine>(join(dir, f), {} as VzgLine))
    .filter((l) => Array.isArray(l.tracks)); // not geometry.toml
}

function loadSpeeds(
  lines: VzgLine[],
  stations: Map<string, { lat: number; lon: number }>,
): SpeedLookup | undefined {
  if (!lines.length) return undefined;
  const lookup = speedLookup(lines);
  return (a, b, cat, len) => {
    const sa = stations.get(a);
    const sb = stations.get(b);
    return sa && sb ? lookup([sa.lat, sa.lon], [sb.lat, sb.lon], VMAX[cat] ?? 160, len) : undefined;
  };
}

async function main() {
  const { values } = parseArgs({
    options: {
      day: { type: "string", default: DEFAULT_DAY },
      cats: { type: "string", default: DEFAULT_CATS.join(",") },
      candidates: { type: "boolean", default: false },
    },
  });
  const day = values.day;
  const cats = values.cats.split(",");
  const t0 = Date.now();
  // GTFS tables from the local SQLite (vp run db:build); shapes still from the zip (loadShapes)
  const src = recordSource(openZugxDb());
  const feed = loadFeed(src, day);
  console.log(`${day}: ${feed.trips.length} rail trips (${Date.now() - t0} ms)`);

  if (values.candidates) {
    for (const c of nodeCandidates(feed, new Set(cats))) {
      const mark = NODES.some((n) => n.id === c.id) ? "*" : " ";
      console.log(mark, String(c.deps).padStart(4), String(c.neighbours).padStart(3), c.id, c.name);
    }
  }

  mkdirSync(join(out, "corridors"), { recursive: true });
  const hafas = loadHafasMap();
  for (const dt of DAY_TYPES) {
    const d = dt.type === "weekday" ? day : dt.day;
    const f = d === day ? feed : loadFeed(src, d);
    const model = buildNetz(f, { day: d, source: SOURCE, cats, nodes: NODES, hafas });
    writeFileSync(join(out, `netz${dt.suffix}.toml`), toToml(model));
    writeFileSync(join(out, `nge${dt.suffix}.json`), `${JSON.stringify(toNge(model))}\n`);
    console.log(
      `netz${dt.suffix}.toml (${dt.type} ${d}): ${model.nodes.length} nodes, ${model.trainruns.length} lines, ${model.edges.length} edges (+ nge${dt.suffix}.json)`,
    );
  }

  const names = new Map(NODES.filter((n) => n.name).map((n) => [n.id, n.name!]));
  // corridors: trains of the whole timetable year, each with its running days
  const period = feedPeriod(src);
  const year = {
    feed: loadFeed(src, null),
    days: serviceDays(src, period.begin, period.end),
    ...period,
  };
  console.log(
    `${period.begin} – ${period.end}: ${year.feed.trips.length} rail trips (${Date.now() - t0} ms)`,
  );
  // route geometry: trains skipping stations of a sheet are only drawn there if they really run
  // along its line (not on a parallel one, e.g. Wien – St. Pölten high-speed line vs. Neulengbach)
  const shapeIds = new Set(year.feed.trips.flatMap((t) => (t.shape ? [t.shape] : [])));
  const shapes = await loadShapes(join(root, ".cache"), shapeIds);
  console.log(`${shapes.size} shapes (${Date.now() - t0} ms)`);
  const dayIdx = Temporal.PlainDate.from(period.begin).until(day).days;
  const runsOnDay = (b64: string) => {
    const b = Buffer.from(b64, "base64")[dayIdx >> 3] ?? 0;
    return ((b >> (7 - (dayIdx & 7))) & 1) === 1;
  };
  const index: CorridorIndex = {
    day,
    ...period,
    source: SOURCE,
    aliases: CORRIDOR_ALIASES,
    corridors: [],
  };
  const vzgLines = loadVzg();
  const speeds = loadSpeeds(vzgLines, year.feed.stations);
  const signalsAt = vzgLines.length ? signalLookup(vzgLines) : undefined;
  // the railway line each train runs on between two corridor stations (parallel lines)
  const findLine = vzgLines.length ? lineFinder(vzgLines) : undefined;
  const lineCache = new Map<string, string | undefined>();
  const lineOf = findLine
    ? (trip: { shape?: string }, a: number, b: number) => {
        const sh = trip.shape ? shapes.get(trip.shape) : undefined;
        if (!sh) return undefined;
        const k = `${trip.shape}|${a}|${b}`;
        if (!lineCache.has(k)) lineCache.set(k, shapeLine(findLine, sh, a, b));
        return lineCache.get(k);
      }
    : undefined;
  const vzgById = new Map(vzgLines.map((l) => [l.id, l]));
  console.log(speeds ? "passing times weighted by VzG speed limits" : "passing times by distance");
  // single/double track per corridor along the trains' shapes: from the OSM tracks
  // (.cache/osm-rail.json of vzg:extract), else from the VzG network pieces
  const netFile = join(root, "packages", "vzg", "data", "network.toml");
  const net = existsSync(netFile)
    ? readToml<{ lines: { id: string; pieces: { line: string; tr: number }[] }[] }>(netFile, {
        lines: [],
      })
    : undefined;
  const osmFile = join(root, ".cache", "osm-rail.json");
  const osm = existsSync(osmFile)
    ? (JSON.parse(readFileSync(osmFile, "utf8")) as RailWays)
    : undefined;
  console.log(`track counts from ${osm ? "the OSM tracks" : net ? "the VzG network" : "-"}`);
  const pairs = net || osm ? pairTrips(year.feed.trips, shapes) : undefined;
  for (const def of CORRIDORS) {
    const c = buildCorridor(feed, def, day, SOURCE, names, year, shapes, speeds, lineOf);
    for (const st of c.stations) {
      const h = hafas?.get(st.id);
      if (h) st.hafasId = h;
    }
    // block sections: main signals between neighbouring stations (capacity / blocking times)
    if (signalsAt) {
      const up: number[] = [];
      const down: number[] = [];
      const known: [number, number][] = [];
      const places: number[] = [];
      /** the sheet's own line per neighbouring station pair (k → k+1) */
      const home = new Map<number, string>();
      for (let k = 0; k + 1 < c.stations.length; k++) {
        const a = c.stations[k]!;
        const b = c.stations[k + 1]!;
        const ga = year.feed.stations.get(a.id);
        const gb = year.feed.stations.get(b.id);
        if (!ga || !gb || b.km <= a.km) continue;
        const sig = signalsAt([ga.lat, ga.lon], [gb.lat, gb.lon], b.km - a.km);
        if (!sig) continue;
        known.push([a.km, b.km]);
        home.set(k, sig.line);
        for (const f of sig.places)
          places.push(Math.round((a.km + f * (b.km - a.km)) * 1000) / 1000);
        for (const s of sig.signals) {
          const km = Math.round((a.km + s.f * (b.km - a.km)) * 1000) / 1000;
          (s.dir === 1 ? up : down).push(km);
        }
      }
      // crossing places without passenger stop (not always mapped as stations): where both
      // directions have an entry and an exit signal within 2 km (a passing loop)
      const ups = [...new Set(up)].sort((x, y) => x - y);
      const downs = [...new Set(down)].sort((x, y) => x - y);
      for (const u of ups) {
        const nu = ups.filter((x) => x >= u && x <= u + 2);
        const nd = downs.filter((x) => x >= u - 0.5 && x <= u + 2.5);
        if (nu.length < 2 || nd.length < 2) continue;
        const mid =
          Math.round(((Math.min(...nu, ...nd) + Math.max(...nu, ...nd)) / 2) * 1000) / 1000;
        const nearStop = c.stations.some((st) => Math.abs(st.km - mid) < 1);
        if (!nearStop && !places.some((p) => Math.abs(p - mid) < 1)) places.push(mid);
      }
      places.sort((x, y) => x - y);
      // trains' stretches on another line than the sheet's own (majority of the station pairs)
      for (const t of c.trains) {
        if (!t.via) continue;
        const keep = t.via.filter(([vi, vj, line]) => {
          const [i, j] = vi < vj ? [vi, vj] : [vj, vi];
          let other = 0;
          let n = 0;
          for (let k = i; k < j; k++) {
            const h = home.get(k);
            if (!h) continue;
            n++;
            if (h !== line) other++;
          }
          return n > 0 && other / n > 0.5;
        });
        if (keep.length) t.via = keep;
        else delete t.via;
      }
      // trains whose GTFS shape doesn't show the other line (ÖBB shapes often follow the old line,
      // e.g. IR 515 in the Unterinntal tunnel): a train without a stop on a stretch that at least
      // 5 other trains demonstrably run on another line takes that line too
      const axisPts = c.stations.flatMap((st) => {
        const g = year.feed.stations.get(st.id);
        return g ? [{ pos: [g.lat, g.lon] as [number, number], km: st.km }] : [];
      });
      // a bypass: the other line has no stations of its own on the stretch — all its stations
      // there are also on the sheet's own line (e.g. 330 01 next to the old line's stations)
      const stationsOf = (lineId: string, kmA: number, kmB: number) => {
        const line = vzgById.get(lineId);
        const out = new Set<string>();
        for (const t of line?.tracks ?? [])
          for (const p of t.points) {
            if (!p.pos || (p.kind !== "station" && p.kind !== "halt" && p.kind !== "stop"))
              continue;
            const ck = corridorKmAt(axisPts, p.pos, 2);
            if (ck !== undefined && ck > kmA + 0.5 && ck < kmB - 0.5)
              out.add(p.uic ?? p.label ?? "");
          }
        return out;
      };
      const isBypass = (lineId: string, i: number, j: number) => {
        if (!vzgById.has(lineId)) return false;
        const [kmA, kmB] = [c.stations[i]!.km, c.stations[j]!.km];
        const own = new Set<string>();
        for (let k = i; k < j; k++) {
          const h = home.get(k);
          if (h) for (const x of stationsOf(h, kmA, kmB)) own.add(x);
        }
        return [...stationsOf(lineId, kmA, kmB)].every((x) => own.has(x));
      };
      const seen = new Map<string, { i: number; j: number; line: string; n: number }>();
      for (const t of c.trains)
        for (const [vi, vj, line] of t.via ?? []) {
          const [i, j] = vi < vj ? [vi, vj] : [vj, vi];
          const k = `${i}|${j}|${line}`;
          const x = seen.get(k) ?? { i, j, line, n: 0 };
          x.n++;
          seen.set(k, x);
        }
      for (const s of [...seen.values()]
        // only stretches skipping at least two stations (skipping them is what tells the line apart),
        // and only bypass lines without stations of their own there (e.g. the Unterinntal tunnel;
        // not parallel lines with stations such as the Pottendorfer Linie, where not stopping
        // says nothing about the line)
        .filter((x) => x.n >= 5 && x.j - x.i >= 3 && isBypass(x.line, x.i, x.j))
        .sort((a, b) => b.j - b.i - (a.j - a.i)))
        for (const t of c.trains) {
          const idx = t.pts.map((p) => p[0]);
          const [lo, hi] = [Math.min(...idx), Math.max(...idx)];
          if (lo > s.i || hi < s.j) continue; // must run the whole stretch
          const stopInside = t.pts.some(
            ([i], q) =>
              i > s.i && i < s.j && (q === 0 || q === t.pts.length - 1 || !t.pass?.includes(i)),
          );
          if (stopInside) continue;
          const via = t.via ?? [];
          const covered = via.some(([a, b]) => Math.min(a, b) <= s.i && Math.max(a, b) >= s.j);
          if (covered) continue;
          // drop shorter stretches inside it, add this one (in the train's direction)
          t.via = [
            ...via.filter(([a, b]) => !(Math.min(a, b) >= s.i && Math.max(a, b) <= s.j)),
            t.dir === 1 ? [s.i, s.j, s.line] : [s.j, s.i, s.line],
          ];
        }
      // passing points were only needed for that (not written: would touch every train's line)
      for (const t of c.trains) delete t.pass;
      // other lines some trains take: their block signals on the corridor's km axis — each signal
      // placed by its position (line km → position → projected onto the corridor's stations)
      const alt: NonNullable<NonNullable<typeof c.blocks>["alt"]> = [];
      const axis = c.stations.flatMap((st) => {
        const g = year.feed.stations.get(st.id);
        return g ? [{ pos: [g.lat, g.lon] as [number, number], km: st.km }] : [];
      });
      for (const t of c.trains)
        for (const [vi, vj, lineId] of t.via ?? []) {
          const [i, j] = vi < vj ? [vi, vj] : [vj, vi];
          if (alt.some((x) => x.i === i && x.j === j && x.line === lineId)) continue;
          const line = vzgById.get(lineId);
          if (!line) continue;
          const [kmA, kmB] = [c.stations[i]!.km, c.stations[j]!.km];
          // which line direction runs along the corridor: compare two whole-km posts
          const posts = line.tracks[0]?.geo?.posts ?? [];
          const placed = posts
            .map(([k, la, lo]) => [k, corridorKmAt(axis, [la, lo])] as const)
            .filter((x): x is readonly [number, number] => x[1] !== undefined);
          if (placed.length < 2) continue;
          const along =
            (placed.at(-1)![1] - placed[0]![1]) * (placed.at(-1)![0] - placed[0]![0]) > 0;
          const sig = (rel: 1 | -1) => {
            const lineDir = (along ? rel : -rel) as 1 | -1;
            const tr =
              line.tracks.length > 1
                ? (line.tracks.find((x) => x.track === (lineDir === 1 ? "1" : "2")) ??
                  line.tracks[0]!)
                : line.tracks[0]!;
            return tr.points.flatMap((p) => {
              if (
                p.kind !== "signal" ||
                p.dir !== lineDir ||
                !/main|combined|train_protection/.test(p.signal ?? "")
              )
                return [];
              const pos = linePosAt(line, p.km);
              const ck = pos ? corridorKmAt(axis, pos) : undefined;
              return ck !== undefined && ck > kmA && ck < kmB ? [Math.round(ck * 1000) / 1000] : [];
            });
          };
          const sorted = (xs: number[]) => [...new Set(xs)].sort((x, y) => x - y);
          alt.push({ i, j, line: lineId, up: sorted(sig(1)), down: sorted(sig(-1)) });
        }
      if (known.length)
        c.blocks = {
          up: [...new Set(up)].sort((x, y) => x - y),
          down: [...new Set(down)].sort((x, y) => x - y),
          known,
          ...(places.length ? { places } : {}),
          ...(alt.length ? { alt } : {}),
        };
    }
    // minimum running times per category between neighbouring stations (running-time reserve)
    if (speeds) {
      const min: Record<string, [number | null, number | null][]> = {};
      for (const cat of new Set(c.trains.map((t) => t.cat))) {
        const row: [number | null, number | null][] = [];
        let known = 0;
        for (let k = 0; k + 1 < c.stations.length; k++) {
          const a = c.stations[k]!;
          const b = c.stations[k + 1]!;
          const len = Math.abs(b.km - a.km);
          const t = (v: number | undefined) =>
            v && len > 0 ? Math.round((len / v) * 600) / 10 : null;
          const pair: [number | null, number | null] = [
            t(speeds(a.id, b.id, cat, len)),
            t(speeds(b.id, a.id, cat, len)),
          ];
          if (pair[0] !== null) known++;
          row.push(pair);
        }
        if (known) min[cat] = row;
      }
      if (Object.keys(min).length) c.minRun = min;
    }
    if (pairs) {
      // only the VzG lines through the sheet's stations (not a neighbouring single-track line)
      const pos = c.stations.flatMap((st) => {
        const g = year.feed.stations.get(st.id);
        return g ? [[g.lat, g.lon] as [number, number]] : [];
      });
      const through = linesThrough(vzgLines, pos);
      const ids = new Set(through.map((l) => l.id));
      const lookup = trackLookup(
        osm
          ? wayTracks(osm, new Set(through.flatMap((l) => (l.ref ? [l.ref] : []))))
          : pieceTracks(net!.lines.filter((l) => ids.has(l.id)).flatMap((l) => l.pieces)),
      );
      const tr = corridorTracks(c.stations, pairs, shapes, lookup);
      if (tr.length) c.tracks = tr;
    }
    const onDay = c.trains.filter((t) => runsOnDay(t.days));
    const file = `${c.id}.toml`;
    writeFileSync(join(out, "corridors", file), corridorToml(c));
    index.corridors.push({
      id: c.id,
      name: c.name,
      ...(def.oebb ? { oebb: def.oebb } : {}),
      from: c.stations[0]?.name ?? "",
      to: c.stations[c.stations.length - 1]?.name ?? "",
      km: c.stations[c.stations.length - 1]?.km ?? 0,
      stations: c.stations.length,
      trains: onDay.length,
      file,
      major: c.stations.filter((st) => st.major).map((st) => st.name),
      names: c.stations.map((st) => st.name),
      cats: Object.fromEntries(
        Object.entries(
          onDay.reduce<Record<string, number>>(
            (acc, t) => ((acc[t.cat] = (acc[t.cat] ?? 0) + 1), acc),
            {},
          ),
        ).sort((a, b) => b[1] - a[1]),
      ),
    });
    console.log(
      `corridors/${file}: ${c.stations.length} stations, ${c.trains.length} distinct runs (${onDay.length} on ${day})`,
    );
  }
  // VzG lines (ÖBB Streckennummern and other railways) running through each sheet's stations
  if (vzgLines.length) {
    for (const e of index.corridors) {
      const c = readToml<{ stations: { id: string }[] }>(join(out, "corridors", e.file), {
        stations: [],
      });
      const pos = c.stations.flatMap((st) => {
        const g = year.feed.stations.get(st.id);
        return g ? [[g.lat, g.lon] as [number, number]] : [];
      });
      const l = linesThrough(vzgLines, pos);
      if (l.length) e.lines = l;
    }
    console.log(`VzG lines for ${index.corridors.filter((e) => e.lines).length} sheets`);
  }
  writeFileSync(join(out, "corridors", "index.toml"), toToml(index));
  // traffic density: trains per day on each km of the VzG lines (reference day)
  if (vzgLines.length) {
    const onDay = year.feed.trips.filter((t) => year.days.get(t.service)?.has(dayIdx));
    const density = trafficDensity(vzgLines, onDay, shapes, day);
    writeFileSync(join(out, "density.toml"), toToml({ ...density, source: SOURCE }));
    console.log(
      `density: ${onDay.length} trips on ${day}, ${density.lines.length} lines (${Date.now() - t0} ms)`,
    );
  }
}

if (import.meta.main) await main();
