// Experiment 2: tagged railway nodes — kilometre positions, signals, stations; sample line 101 01.
import { readPbf } from "../src/pbf.ts";
const file = process.argv[2] ?? "../../.cache/austria-261113.osm.pbf";
const t0 = Date.now();
const kinds = new Map<string, number>();
let withPos = 0;
const posFormats = new Map<string, number>();
const sigTags = new Map<string, number>();
const samples: string[] = [];
const names = [
  "Maria Anzbach",
  "Eichgraben-Altlengbach",
  "Unter Oberndorf",
  "Hutten",
  "Rekawinkel",
];
readPbf(file, {
  taggedNodesOnly: true,
  node: (n) => {
    const r = n.tags.railway;
    if (!r && !n.tags["railway:position"]) return;
    kinds.set(r ?? "(position only)", (kinds.get(r ?? "(position only)") ?? 0) + 1);
    const pos = n.tags["railway:position"] ?? n.tags["railway:position:exact"];
    if (pos) {
      withPos++;
      const f = pos.replace(/\d/g, "9");
      posFormats.set(f, (posFormats.get(f) ?? 0) + 1);
    }
    if (r === "signal")
      for (const k of Object.keys(n.tags))
        if (k.startsWith("railway:signal:") && !k.includes(":", 15))
          sigTags.set(k, (sigTags.get(k) ?? 0) + 1);
    if (
      n.tags.name &&
      names.some((x) => n.tags.name!.startsWith(x)) &&
      (r === "station" || r === "halt" || r === "stop")
    )
      samples.push(
        `${r} ${n.tags.name} pos=${n.tags["railway:position"] ?? "-"} exact=${n.tags["railway:position:exact"] ?? "-"} ref=${n.tags["railway:ref"] ?? n.tags.ref ?? "-"}`,
      );
  },
});
console.log(`tagged-node pass: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
console.log("railway node kinds:", [...kinds].sort((a, b) => b[1] - a[1]).slice(0, 20));
console.log(
  "with railway:position:",
  withPos,
  "formats:",
  [...posFormats].sort((a, b) => b[1] - a[1]).slice(0, 8),
);
console.log("signal tags:", [...sigTags].sort((a, b) => b[1] - a[1]).slice(0, 14));
console.log(samples.join("\n"));
