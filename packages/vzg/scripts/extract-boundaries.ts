/**
 * Borders of Austria and its nine federal states from the OSM PBF → packages/vzg/data/
 * boundaries.toml (simplified polygons, ODbL), for the network map.
 *
 *   node packages/vzg/scripts/extract-boundaries.ts [.cache/austria-YYMMDD.osm.pbf]
 *
 * Three passes over the file (PBF order: nodes, ways, relations — we need them the other way
 * round): relations (boundary=administrative, admin_level 2 with ISO3166-1 AT, admin_level 4
 * with ISO3166-2 AT-1 … AT-9) → their member ways → the ways' node coordinates. Rings are
 * assembled from the outer ways by joining shared end nodes.
 */
import { join } from "node:path";
import { writeToml } from "@zugx/toml";
import { encodePolyline, simplify } from "../src/geo.ts";
import { readPbf } from "../src/pbf.ts";

type Coord = [number, number];
const root = join(import.meta.dirname, "..", "..", "..");
const input = process.argv[2] ?? join(root, ".cache", "austria-261113.osm.pbf");
const out = join(import.meta.dirname, "..", "data", "boundaries.toml");
const t0 = Date.now();
const lap = () => `${((Date.now() - t0) / 1000).toFixed(1)} s`;

interface Area {
  code: string;
  name: string;
  outer: number[];
}
const areas: Area[] = [];
readPbf(input, {
  relation: (r) => {
    const t = r.tags;
    if (t.type !== "boundary" || t.boundary !== "administrative") return;
    const code =
      t.admin_level === "2" && t["ISO3166-1"] === "AT"
        ? "AT"
        : t.admin_level === "4" && /^AT-\d$/.test(t["ISO3166-2"] ?? "")
          ? t["ISO3166-2"]!
          : undefined;
    if (!code) return;
    areas.push({
      code,
      name: t["name:de"] ?? t.name ?? code,
      outer: r.members.filter((m) => m.type === "way" && m.role !== "inner").map((m) => m.ref),
    });
  },
});
console.log(`relations: ${areas.map((a) => a.code).join(" ")} (${lap()})`);

const wayIds = new Set(areas.flatMap((a) => a.outer));
const ways = new Map<number, number[]>();
readPbf(input, { way: (w) => wayIds.has(w.id) && void ways.set(w.id, w.refs) });
const nodeIds = new Set([...ways.values()].flat());
const coords = new Map<number, Coord>();
readPbf(input, { node: (n) => nodeIds.has(n.id) && void coords.set(n.id, [n.lat, n.lon]) });
console.log(`${ways.size} ways, ${coords.size} nodes (${lap()})`);

/** join ways into closed rings by their end nodes */
function rings(ids: number[]): number[][] {
  const pool = ids.map((id) => ways.get(id)).filter((w): w is number[] => !!w && w.length > 1);
  const out: number[][] = [];
  while (pool.length) {
    let ring = [...pool.shift()!];
    for (let grown = true; grown && ring[0] !== ring.at(-1);) {
      grown = false;
      for (let i = 0; i < pool.length; i++) {
        const w = pool[i]!;
        if (w[0] === ring.at(-1)) ring = [...ring, ...w.slice(1)];
        else if (w.at(-1) === ring.at(-1)) ring = [...ring, ...[...w].reverse().slice(1)];
        else if (w.at(-1) === ring[0]) ring = [...w, ...ring.slice(1)];
        else if (w[0] === ring[0]) ring = [...[...w].reverse(), ...ring.slice(1)];
        else continue;
        pool.splice(i, 1);
        grown = true;
        break;
      }
    }
    if (ring.length > 3) out.push(ring);
  }
  return out;
}

/** Douglas–Peucker on a closed ring: start = end would be a zero-length base, so simplify halves */
function simplifyRing(pts: Coord[], tol: number): Coord[] {
  const mid = Math.floor(pts.length / 2);
  return [...simplify(pts.slice(0, mid + 1), tol), ...simplify(pts.slice(mid), tol).slice(1)];
}

const result = areas
  .sort((a, b) => a.code.localeCompare(b.code))
  .map((a) => ({
    code: a.code,
    name: a.name,
    rings: rings(a.outer)
      .map((r) => r.map((n) => coords.get(n)).filter((c): c is Coord => !!c))
      .map((pts) => simplifyRing(pts, a.code === "AT" ? 150 : 100))
      .filter((pts) => pts.length > 3)
      .map(encodePolyline),
  }));
writeToml(out, {
  source: "OpenStreetMap, © OpenStreetMap contributors, ODbL 1.0",
  areas: result,
});
console.log(
  `→ ${out}: ${result.map((a) => `${a.code} ${a.rings.length} ring(s)`).join(", ")} (${lap()})`,
);
