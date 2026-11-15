/**
 * Build: ÖBB GTFS → data/netz.toml, data/nge.json (Netzgrafik-Editor), data/corridors/*.toml
 *
 *   vpx packages/netz/src/build.ts [--day=2026-03-10] [--cats=RJX,RJ,…]
 *
 * GTFS source: env GTFS_DIR (unzipped) or GTFS_ZIP, else `<repo>/.cache/`
 * (downloaded if missing).
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { readToml, toToml } from "@zugx/toml";
import { linesThrough, speedLookup } from "@zugx/vzg/speed";
import type { VzgLine } from "@zugx/vzg";
import {
  buildCorridor,
  corridorToml,
  CORRIDOR_ALIASES,
  CORRIDORS,
  type SpeedLookup,
} from "./corridors.ts";
import { feedPeriod, loadFeed, loadShapes, openFeed, parentDhid, serviceDays } from "./gtfs.ts";
import { buildNetz } from "./netz.ts";
import { trafficDensity } from "./density.ts";
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
  const src = await openFeed(join(root, ".cache"));
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
  console.log(speeds ? "passing times weighted by VzG speed limits" : "passing times by distance");
  for (const def of CORRIDORS) {
    const c = buildCorridor(feed, def, day, SOURCE, names, year, shapes, speeds);
    for (const st of c.stations) {
      const h = hafas?.get(st.id);
      if (h) st.hafasId = h;
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
