// Build data/abbr.toml (per country, COUNTRY): the operating-point abbreviation (Betriebsstellen-Kürzel, e.g. "Kt",
// "Vb", "Vps", "Fel") per HAFAS station, from OpenStreetMap `railway:ref` on stations and halts
// (plain abbreviations only, not suffixed ones such as "Abf H1").
// OSM's uic_ref holds infrastructure codes, not the HAFAS ids, so stations are matched by position
// (≤ 600 m) and name (similarity ≥ 0.5); the best-scoring OSM node per HAFAS station wins.
// One station per line (small diffs). Local step like the VzG build (needs the OSM extract):
//   COUNTRY=si vp run stations:abbr   [.cache/<extract>-YYMMDD.osm.pbf]
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { dataDir, osmPbf } from "@zugx/gtfs/country";
import { readPbf } from "../../vzg/src/pbf.ts";
import { readToml } from "@zugx/toml";
import { distanceMetres, nameSimilarity } from "./match.ts";

const input = process.argv[2] ?? osmPbf();
const DATA = dataDir("stations");
const OUT = join(DATA, "abbr.toml");
const KINDS = new Set(["station", "halt", "stop"]);
const PLAIN = /^\p{Lu}\p{Ll}{0,3}$/u;

interface Station {
  id: string;
  name: string;
  lat: number;
  lon: number;
}
const { stations } = readToml<{ stations: Station[] }>(join(DATA, "stations.toml"), {
  stations: [],
});
// grid for nearby lookups (~0.01° cells)
const grid = new Map<string, Station[]>();
const cell = (lat: number, lon: number) => `${Math.floor(lat * 100)},${Math.floor(lon * 100)}`;
for (const s of stations) {
  const k = cell(s.lat, s.lon);
  grid.set(k, [...(grid.get(k) ?? []), s]);
}
function near(lat: number, lon: number): Station[] {
  const [a, b] = [Math.floor(lat * 100), Math.floor(lon * 100)];
  const out: Station[] = [];
  for (let x = a - 1; x <= a + 1; x++)
    for (let y = b - 1; y <= b + 1; y++) out.push(...(grid.get(`${x},${y}`) ?? []));
  return out;
}

/** HAFAS id → best match so far */
const best = new Map<string, { ref: string; score: number }>();
let refs = 0;
readPbf(input, {
  taggedNodesOnly: true,
  node: (n) => {
    const t = n.tags;
    const ref = t["railway:ref"]?.trim();
    if (!ref || !KINDS.has(t.railway ?? "") || !t.name) return;
    // only the plain abbreviation of an operating point ("Kt", "Vps"); refs with a suffix such
    // as "Abf H1" / "Z K1" denote a halt or point belonging to another operating point
    if (!PLAIN.test(ref)) return;
    refs++;
    for (const s of near(n.lat, n.lon)) {
      const d = distanceMetres(n.lat, n.lon, s.lat, s.lon);
      if (d > 600) continue;
      const sim = nameSimilarity(t.name, s.name);
      if (sim < 0.5) continue;
      // name first, then distance; stations before halts
      const score = sim * 2 - d / 600 + (t.railway === "station" ? 0.2 : 0);
      const old = best.get(s.id);
      if (!old || score > old.score) best.set(s.id, { ref, score });
    }
  },
});

// an abbreviation belongs to one station: the best-matching one
const top = new Map<string, number>();
for (const { ref, score } of best.values())
  top.set(ref, Math.max(top.get(ref) ?? -Infinity, score));
for (const [id, { ref, score }] of best) if (score < top.get(ref)!) best.delete(id);

const lines = [...best]
  .sort((a, b) => a[0].localeCompare(b[0]))
  .map(([id, { ref }]) => `${JSON.stringify(id)} = ${JSON.stringify(ref)}`);
writeFileSync(
  OUT,
  `# operating-point abbreviations (railway:ref) per HAFAS station id, from OpenStreetMap\n# (© OpenStreetMap contributors, ODbL 1.0); built by packages/stations/src/abbr.ts\n${lines.join("\n")}\n`,
);
console.log(
  `abbr: ${refs} OSM nodes with railway:ref → ${best.size} of ${stations.length} stations → ${OUT}`,
);
