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
import { loadFeed, openFeed } from "./gtfs.ts";
import { buildNetz } from "./netz.ts";
import { toNge } from "./nge.ts";
import { nodeCandidates, NODES } from "./nodes.ts";
import type { CorridorIndex } from "./types.ts";

/** Regular Tuesday outside school holidays. */
export const DEFAULT_DAY = "2026-03-10";
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
  const feed = loadFeed(await openFeed(join(root, ".cache")), day);
  console.log(`${day}: ${feed.trips.length} rail trips (${Date.now() - t0} ms)`);

  if (values.candidates) {
    for (const c of nodeCandidates(feed, new Set(cats))) {
      const mark = NODES.some((n) => n.id === c.id) ? "*" : " ";
      console.log(mark, String(c.deps).padStart(4), String(c.neighbours).padStart(3), c.id, c.name);
    }
  }

  const model = buildNetz(feed, { day, source: SOURCE, cats, nodes: NODES, hafas: loadHafasMap() });
  mkdirSync(join(out, "corridors"), { recursive: true });
  writeFileSync(join(out, "netz.json"), prettyJson(model));
  console.log(
    `netz.json: ${model.nodes.length} nodes, ${model.lines.length} lines, ${model.edges.length} edges`,
  );

  writeFileSync(join(out, "nge.json"), `${JSON.stringify(toNge(model))}\n`);
  console.log("nge.json written");

  const names = new Map(NODES.filter((n) => n.name).map((n) => [n.id, n.name!]));
  const index: CorridorIndex = { day, source: SOURCE, corridors: [] };
  for (const def of CORRIDORS) {
    const c = buildCorridor(feed, def, day, SOURCE, names);
    const file = `${c.id}.json`;
    writeFileSync(join(out, "corridors", file), corridorJson(c));
    index.corridors.push({
      id: c.id,
      name: c.name,
      from: c.stations[0]?.name ?? "",
      to: c.stations[c.stations.length - 1]?.name ?? "",
      km: c.stations[c.stations.length - 1]?.km ?? 0,
      stations: c.stations.length,
      trains: c.trains.length,
      file,
    });
    console.log(`corridors/${file}: ${c.stations.length} stations, ${c.trains.length} trains`);
  }
  writeFileSync(join(out, "corridors", "index.json"), prettyJson(index));
}

if (import.meta.main) await main();
