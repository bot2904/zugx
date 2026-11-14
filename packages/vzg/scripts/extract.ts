/**
 * Step 1: extract the railway line network from an OSM PBF into a compact JSON (intermediate,
 * `.cache/osm-rail.json`, not committed; ODbL).
 *
 *   node packages/vzg/scripts/extract.ts [.cache/austria-YYMMDD.osm.pbf] [.cache/osm-rail.json]
 *
 * Pass 1 (ways + relations): `railway=rail` ways except yard/siding/spur and industrial/military
 * (line tracks have a line `ref` such as "101 01" or are in a `route=tracks` relation; the others
 * connect them, e.g. station through tracks without ref), and `route=tracks` relations (one per
 * ÖBB line). Pass 2 (nodes): coordinates of their nodes, railway nodes on them (signals, stops,
 * milestones, switches, level crossings, positions), and all named stations/halts (usually placed
 * beside the tracks) with their coordinates.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { readPbf, type Tags } from "../src/pbf.ts";
import type { RailExtract } from "../src/types.ts";

const root = join(import.meta.dirname, "..", "..", "..");
const input = process.argv[2] ?? join(root, ".cache", "austria-261113.osm.pbf");
const output = process.argv[3] ?? join(root, ".cache", "osm-rail.json");

/** way tags kept (the rest is not needed for speed profiles / line diagrams) */
const WAY_TAGS = [
  "ref",
  "name",
  "railway:track_ref",
  "maxspeed",
  "maxspeed:forward",
  "maxspeed:backward",
  "railway:preferred_direction",
  "railway:bidirectional",
  "usage",
  "service",
  "tracks",
  "tunnel",
  "bridge",
  "electrified",
  "railway:pzb",
  "railway:etcs",
  "railway:track_class",
  "operator",
];
const NODE_KINDS = new Set([
  "signal",
  "station",
  "halt",
  "stop",
  "milestone",
  "switch",
  "level_crossing",
  "crossing",
  "buffer_stop",
]);
const pick = (t: Tags, keys: string[]) =>
  Object.fromEntries(keys.filter((k) => t[k] !== undefined).map((k) => [k, t[k]!]));

const t0 = Date.now();
const lap = () => `${((Date.now() - t0) / 1000).toFixed(1)} s`;

// ---- pass 1: relations first (to know member ways), then ways (PBF order: ways before relations,
// so collect all candidate rail ways and filter afterwards)
const relations: RailExtract["lines"] = [];
const candidates = new Map<number, { refs: number[]; tags: Tags }>();
readPbf(input, {
  way: (w) => {
    const t = w.tags;
    if (t.railway !== "rail") return;
    if (t.service === "yard" || t.service === "siding" || t.service === "spur") return;
    if (t.usage === "industrial" || t.usage === "military" || t.usage === "test") return;
    candidates.set(w.id, { refs: w.refs, tags: pick(t, WAY_TAGS) });
  },
  relation: (r) => {
    const t = r.tags;
    if (t.type !== "route" || t.route !== "tracks") return;
    relations.push({
      id: r.id,
      ref: t.ref ?? "",
      name: t.name ?? "",
      operator: t.operator ?? "",
      ...(t.from ? { from: t.from } : {}),
      ...(t.to ? { to: t.to } : {}),
      ways: r.members.filter((m) => m.type === "way").map((m) => m.ref),
    });
  },
});
const ways: RailExtract["ways"] = [];
for (const [id, w] of candidates) ways.push({ id, nodes: w.refs, tags: w.tags });
candidates.clear();
console.log(
  `pass 1: ${ways.length} line track ways, ${relations.length} route=tracks relations (${lap()})`,
);

// ---- pass 2: node coordinates + railway nodes on the line tracks
const needed = new Set<number>();
for (const w of ways) for (const n of w.nodes) needed.add(n);
const coords: RailExtract["coords"] = {};
const nodes: RailExtract["nodes"] = [];
const stations: RailExtract["stations"] = [];
readPbf(input, {
  node: (n) => {
    const kind = n.tags.railway;
    if ((kind === "station" || kind === "halt") && n.tags.name)
      stations.push({
        id: n.id,
        lat: Math.round(n.lat * 1e7) / 1e7,
        lon: Math.round(n.lon * 1e7) / 1e7,
        tags: Object.fromEntries(
          Object.entries(n.tags).filter(
            ([k]) => k === "railway" || k === "name" || k.startsWith("railway:"),
          ),
        ),
      });
    if (!needed.has(n.id)) return;
    coords[n.id] = [Math.round(n.lat * 1e7) / 1e7, Math.round(n.lon * 1e7) / 1e7];
    if (
      (kind && NODE_KINDS.has(kind)) ||
      n.tags["railway:position"] ||
      n.tags["railway:position:exact"]
    ) {
      const tags = Object.fromEntries(
        Object.entries(n.tags).filter(
          ([k]) =>
            k === "railway" ||
            k === "name" ||
            k === "ref" ||
            k.startsWith("railway:") ||
            k === "public_transport",
        ),
      );
      nodes.push({ id: n.id, tags });
    }
  },
});
console.log(
  `pass 2: ${Object.keys(coords).length} coordinates, ${nodes.length} railway nodes, ${stations.length} stations (${lap()})`,
);

const extract: RailExtract = {
  source: input.split("/").pop()!,
  created: new Date().toISOString().slice(0, 10),
  lines: relations,
  ways,
  nodes,
  stations,
  coords,
};
writeFileSync(output, JSON.stringify(extract));
console.log(`→ ${output} (${lap()})`);
