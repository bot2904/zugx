// Experiment: lines that are missing or whose path is much longer than their km range
import { readFileSync } from "node:fs";
import { parsePosition } from "../src/lines.ts";
import type { RailExtract } from "../src/types.ts";
import { fromToml } from "@zugx/toml";
const ex = JSON.parse(readFileSync(".cache/osm-rail.json", "utf8")) as RailExtract;
const idx = fromToml<{
  lines: { ref: string; length: number; kmFrom: number; kmTo: number; tracks: string[] }[];
}>(readFileSync("packages/vzg/data/index.toml", "utf8"));
const built = new Set(idx.lines.map((l) => l.ref));
const refs = new Set<string>();
for (const l of ex.lines) if (/^\d{3} \d{2}$/.test(l.ref)) refs.add(l.ref);
for (const w of ex.ways) if (/^\d{3} \d{2}$/.test(w.tags.ref ?? "")) refs.add(w.tags.ref!);
const nodeTags = new Map(ex.nodes.map((n) => [n.id, n.tags]));
const missing = [...refs].filter((r) => !built.has(r)).sort();
console.log(`refs ${refs.size}, built ${built.size}, missing ${missing.length}:`);
for (const r of missing.slice(0, 15)) {
  const ws = ex.ways.filter((w) => w.tags.ref === r);
  let pos = 0;
  for (const w of ws)
    for (const n of w.nodes)
      if (
        parsePosition(
          nodeTags.get(n)?.["railway:position"] ?? nodeTags.get(n)?.["railway:position:exact"],
        ) !== null
      )
        pos++;
  const trackRefs = new Set(ws.map((w) => w.tags["railway:track_ref"] ?? "-"));
  console.log(
    `  ${r}: ${ws.length} ways, ${pos} km positions, track_refs ${[...trackRefs].slice(0, 8).join(" ")}`,
  );
}
console.log("detours (length > 1.3 × km range):");
for (const l of idx.lines)
  if (l.length > 1.3 * (l.kmTo - l.kmFrom) && l.length > 2)
    console.log(`  ${l.ref}: length ${l.length} km, km ${l.kmFrom}–${l.kmTo}`);
