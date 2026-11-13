/**
 * Build: ÖBB GTFS → data/netz.json, data/nge.json, data/corridors/*.json
 *
 *   vpx packages/netz/src/build.ts [--day=2026-03-10] [--cats=RJX,RJ,…]
 *
 * GTFS source: env GTFS_DIR (unzipped) or GTFS_ZIP, else `<repo>/.cache/`
 * (downloaded if missing).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { buildCorridor, corridorJson, CORRIDORS } from "./corridors.ts";
import { feedPeriod, loadFeed, openFeed, serviceDays } from "./gtfs.ts";
import { buildNetz } from "./netz.ts";
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

/** Pretty JSON with short arrays / small objects collapsed onto one line. */
export function prettyJson(v: unknown): string {
  return `${JSON.stringify(v, null, 2)
    .replace(
      /\[\s+([^[\]{}]*?)\s+\]/g,
      (_, inner: string) => `[${inner.replace(/\s*\n\s*/g, " ")}]`,
    )
    .replace(/\{\s+([^{}[\]]*?)\s+\}/g, (m, inner: string) =>
      inner.length < 140 ? `{ ${inner.replace(/\s*\n\s*/g, " ")} }` : m,
    )}\n`;
}

function loadHafasMap(): Map<string, string> | undefined {
  const p = join(root, "packages", "stations", "data", "gtfs-hafas-map.json");
  if (!existsSync(p)) return undefined;
  const raw = JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
  const map = new Map<string, string>();
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string") map.set(k, v);
    else if (v && typeof v === "object" && "id" in v) map.set(k, String(v.id));
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
    writeFileSync(join(out, `netz${dt.suffix}.json`), prettyJson(model));
    writeFileSync(join(out, `nge${dt.suffix}.json`), `${JSON.stringify(toNge(model))}\n`);
    console.log(
      `netz${dt.suffix}.json (${dt.type} ${d}): ${model.nodes.length} nodes, ${model.lines.length} lines, ${model.edges.length} edges (+ nge${dt.suffix}.json)`,
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
  const dayIdx = Math.round(
    (Date.parse(`${day}T00:00:00Z`) - Date.parse(`${period.begin}T00:00:00Z`)) / 86_400_000,
  );
  const runsOnDay = (b64: string) => {
    const b = Buffer.from(b64, "base64")[dayIdx >> 3] ?? 0;
    return ((b >> (7 - (dayIdx & 7))) & 1) === 1;
  };
  const index: CorridorIndex = { day, ...period, source: SOURCE, corridors: [] };
  for (const def of CORRIDORS) {
    const c = buildCorridor(feed, def, day, SOURCE, names, year);
    const onDay = c.trains.filter((t) => runsOnDay(t.days));
    const file = `${c.id}.json`;
    writeFileSync(join(out, "corridors", file), corridorJson(c));
    index.corridors.push({
      id: c.id,
      name: c.name,
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
  writeFileSync(join(out, "corridors", "index.json"), prettyJson(index));
}

if (import.meta.main) await main();
