/**
 * Step 2: VzG data per line (Streckennummer) and track from the OSM extract →
 * packages/vzg/data/<ref>.toml (e.g. 101-01.toml) + data/index.toml. ODbL (see data/LICENSE.md).
 *
 *   node packages/vzg/scripts/build.ts [.cache/osm-rail.json]
 */
import { mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { writeToml } from "@zugx/toml";
import { connections } from "../src/connections.ts";
import { decodePolyline, encodePolyline, simplify } from "../src/geo.ts";
import { buildLines } from "../src/lines.ts";
import type { RailExtract, VzgIndexEntry } from "../src/types.ts";

const root = join(import.meta.dirname, "..", "..", "..");
const input = process.argv[2] ?? join(root, ".cache", "osm-rail.json");
const out = join(import.meta.dirname, "..", "data");
const t0 = Date.now();
const ex = JSON.parse(readFileSync(input, "utf8")) as RailExtract;
const lines = buildLines(ex);
// connecting lines at the stations (after all lines are built)
for (const [l, c] of connections(lines)) l.connections = c;
mkdirSync(out, { recursive: true });
// old line files (lines may disappear); index, geometry and network are rewritten below,
// boundaries.toml comes from scripts/extract-boundaries.ts and stays
for (const f of readdirSync(out))
  if (f.endsWith(".toml") && f !== "boundaries.toml") rmSync(join(out, f));
// the network map's pieces go to their own file, not into the line files
const network = lines.flatMap((l) => {
  const pieces = l.tracks[0]?.net;
  for (const t of l.tracks) delete t.net;
  return pieces?.length
    ? [
        {
          id: l.id,
          ...(l.ref ? { ref: l.ref } : {}),
          ...(l.name ? { name: l.name } : {}),
          ...(l.operator ? { operator: l.operator } : {}),
          pieces,
          // whole-km posts in path order (traffic density per km section)
          ...((l.tracks[0]?.geo?.posts.length ?? 0) > 1
            ? {
                posts: {
                  km: l.tracks[0]!.geo!.posts.map((p) => p[0]),
                  line: encodePolyline(l.tracks[0]!.geo!.posts.map((p) => [p[1], p[2]])),
                },
              }
            : {}),
        },
      ]
    : [];
});
const index: VzgIndexEntry[] = [];
for (const l of lines) {
  const file = `${l.id}.toml`;
  writeToml(join(out, file), l);
  const t = l.tracks;
  const covered = (tr: (typeof t)[number]) =>
    tr.speeds.filter((s) => s[2] !== null || s[3] !== null).reduce((a, s) => a + s[1] - s[0], 0) /
    Math.max(0.001, tr.kmTo - tr.kmFrom);
  index.push({
    id: l.id,
    ...(l.ref ? { ref: l.ref } : {}),
    oebb: /^\d{3} \d{2}$/.test(l.ref ?? ""),
    ...(l.operator ? { operator: l.operator } : {}),
    ...(l.gauge ? { gauge: l.gauge } : {}),
    ...(l.wikidata ? { wikidata: l.wikidata } : {}),
    ...(l.name ? { name: l.name } : {}),
    ...(l.from ? { from: l.from } : {}),
    ...(l.to ? { to: l.to } : {}),
    file,
    tracks: t.map((tr) => tr.track),
    kmFrom: Math.min(...t.map((tr) => tr.kmFrom)),
    kmTo: Math.max(...t.map((tr) => tr.kmTo)),
    length: Math.max(...t.map((tr) => tr.length)),
    speedCoverage: Math.round(Math.min(...t.map(covered)) * 100) / 100,
    stations: Math.max(
      ...t.map(
        (tr) =>
          new Set(
            tr.points
              .filter((p) => p.kind === "station" || p.kind === "halt" || p.kind === "stop")
              .map((p) => p.label),
          ).size,
      ),
    ),
    signals: Math.max(...t.map((tr) => tr.points.filter((p) => p.kind === "signal").length)),
    names: [
      ...new Set(
        t.flatMap((tr) =>
          tr.points
            .filter(
              (p) => (p.kind === "station" || p.kind === "halt" || p.kind === "stop") && p.label,
            )
            .map((p) => p.label!),
        ),
      ),
    ],
  });
}
// all lines' geometry, coarser (~40 m), for the context network on the line maps
writeToml(join(out, "geometry.toml"), {
  lines: lines.flatMap((l) => {
    const g = l.tracks[0]?.geo;
    if (!g) return [];
    const pts = g.segments.flatMap((s) => decodePolyline(s.line));
    return [
      { id: l.id, ...(l.ref ? { ref: l.ref } : {}), line: encodePolyline(simplify(pts, 40)) },
    ];
  }),
});
writeToml(join(out, "network.toml"), { lines: network });
writeToml(join(out, "index.toml"), {
  source: `OpenStreetMap (${ex.source}), © OpenStreetMap contributors, ODbL 1.0`,
  created: ex.created,
  ...(ex.osmDate ? { osmDate: ex.osmDate } : {}),
  lines: index,
});
console.log(`${lines.length} lines → ${out} (${Date.now() - t0} ms)`);
