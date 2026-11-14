// Experiment 1: what does OSM offer for a VzG-Grafik in Austria? Counts of rail ways, their tags,
// route relations (line numbers), kilometre positions and signals.
import { readPbf } from "../src/pbf.ts";
const file = process.argv[2] ?? "../../.cache/austria-261113.osm.pbf";
const t0 = Date.now();
let rail = 0;
const tagCount = new Map<string, number>();
const usage = new Map<string, number>();
const service = new Map<string, number>();
const refs = new Map<string, number>();
let withMax = 0;
let withMaxDir = 0;
let withTrackRef = 0;
let withRefWay = 0;
const relRoutes = new Map<string, number>();
const relSamples: string[] = [];
readPbf(file, {
  way: (w) => {
    if (w.tags.railway !== "rail") return;
    rail++;
    for (const k of Object.keys(w.tags)) tagCount.set(k, (tagCount.get(k) ?? 0) + 1);
    usage.set(w.tags.usage ?? "-", (usage.get(w.tags.usage ?? "-") ?? 0) + 1);
    service.set(w.tags.service ?? "-", (service.get(w.tags.service ?? "-") ?? 0) + 1);
    if (w.tags.maxspeed) withMax++;
    if (w.tags["maxspeed:forward"] || w.tags["maxspeed:backward"]) withMaxDir++;
    if (w.tags["railway:track_ref"]) withTrackRef++;
    if (w.tags.ref) {
      withRefWay++;
      refs.set(w.tags.ref, (refs.get(w.tags.ref) ?? 0) + 1);
    }
  },
  relation: (r) => {
    if (r.tags.type !== "route" || !["railway", "tracks", "train"].includes(r.tags.route ?? ""))
      return;
    const k = `${r.tags.route}`;
    relRoutes.set(k, (relRoutes.get(k) ?? 0) + 1);
    if ((r.tags.route === "railway" || r.tags.route === "tracks") && relSamples.length < 25)
      relSamples.push(
        `${r.tags.route} ref=${r.tags.ref ?? "-"} name=${r.tags.name ?? "-"} operator=${r.tags.operator ?? "-"} members=${r.members.length}`,
      );
  },
});
console.log(`pass (ways+relations): ${((Date.now() - t0) / 1000).toFixed(1)} s`);
console.log(
  `railway=rail ways: ${rail}; maxspeed ${withMax}, maxspeed:forward/backward ${withMaxDir}, railway:track_ref ${withTrackRef}, ref ${withRefWay}`,
);
console.log("usage:", [...usage].sort((a, b) => b[1] - a[1]).slice(0, 8));
console.log("service:", [...service].sort((a, b) => b[1] - a[1]).slice(0, 8));
console.log(
  "top tags:",
  [...tagCount]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 45)
    .map(([k, v]) => `${k}:${v}`)
    .join(" "),
);
console.log("way ref samples:", [...refs].sort((a, b) => b[1] - a[1]).slice(0, 15));
console.log("route relations:", [...relRoutes]);
console.log(relSamples.join("\n"));
