/**
 * Build: ÖBB GTFS → data/netz.toml, data/nge.json (Netzgrafik-Editor), data/corridors/*.toml
 *
 *   vpx packages/netz/src/build.ts [--day=2026-03-10] [--cats=RJX,RJ,…]
 *
 * GTFS source: env GTFS_DIR (unzipped) or GTFS_ZIP, else `<repo>/.cache/`
 * (downloaded if missing).
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { readToml, toToml } from "@zugx/toml";
import { buildCorridor, corridorToml, CORRIDOR_ALIASES, CORRIDORS } from "./corridors.ts";
import { feedPeriod, loadFeed, loadShapes, openFeed, parentDhid, serviceDays } from "./gtfs.ts";
import { buildNetz } from "./netz.ts";
import { toNge } from "./nge.ts";
import { linesByIbnr, sheetLines } from "./wikidata.ts";
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
  for (const def of CORRIDORS) {
    const c = buildCorridor(feed, def, day, SOURCE, names, year, shapes);
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
  // railway lines per sheet from Wikidata (build-time; keep the previous result if unreachable)
  const ibnrsOf = new Map<string, string[]>();
  for (const e of index.corridors) {
    const c = readToml<{ stations: { hafasId?: string }[] }>(join(out, "corridors", e.file), {
      stations: [],
    });
    ibnrsOf.set(
      e.id,
      c.stations.flatMap((st) => (st.hafasId ? [st.hafasId] : [])),
    );
  }
  try {
    const lines = await linesByIbnr([...new Set([...ibnrsOf.values()].flat())]);
    for (const e of index.corridors) {
      const l = sheetLines(ibnrsOf.get(e.id) ?? [], lines);
      if (l.length) e.lines = l;
    }
    console.log(`Wikidata: lines for ${index.corridors.filter((e) => e.lines).length} sheets`);
  } catch (err) {
    const old = readToml<Partial<CorridorIndex>>(join(out, "corridors", "index.toml"), {});
    for (const e of index.corridors) {
      const prev = old.corridors?.find((o) => o.id === e.id)?.lines;
      if (prev) e.lines = prev;
    }
    console.warn(`Wikidata unreachable (${String(err)}), kept the previous lines`);
  }
  writeFileSync(join(out, "corridors", "index.toml"), toToml(index));
}

if (import.meta.main) await main();
