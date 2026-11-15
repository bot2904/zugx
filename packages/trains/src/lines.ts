// Build data/lines-<year>.toml: the regional line of each train ("S 4017" = "S 1",
// "REX 22332" = "REX 1"), from the GTFS route_short_name (S1, REX1, RX50 …). Live data (HAFAS)
// has both line and train number; the timetable views (Abfahrtsplan, Bildfahrplan, Kursbuch) only
// the train number — this fills in the line. Trains in several lines over the year: the most
// frequent. One train per line (diffable). Run: vp run lines:build
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fetchFeeds, isRailRouteType, loadGtfs, parseTrainName, timer } from "@zugx/gtfs";
import { feedYear } from "./build.ts";

const DATA = join(import.meta.dirname, "..", "data");

/** route_short_name → line for a category: "S1" → "S 1", "RX50" for REX → "REX 50" */
export function lineOf(cat: string, routeShort: string): string | undefined {
  const m = /^([A-Z]+)(\d+)$/.exec(routeShort.trim());
  if (!m) return undefined;
  const rc = m[1] === "RX" ? "REX" : m[1];
  return rc === cat ? `${cat} ${m[2]}` : undefined;
}

async function main() {
  const t = timer();
  const g = await loadGtfs(await fetchFeeds(), {
    keepTrip: (tr, r) => !!r && isRailRouteType(r.type) && tr.shortName !== "",
  });
  const year = Number(process.env.TRAINS_YEAR) || feedYear(g);
  // train → line → number of trips
  const votes = new Map<string, Map<string, number>>();
  for (const trip of g.trips.values()) {
    const tn = parseTrainName(trip.shortName);
    const r = g.routes.get(trip.routeId);
    if (!tn || !r) continue;
    const line = lineOf(tn.cat, r.shortName);
    if (!line) continue;
    const key = `${tn.cat} ${tn.nr}`;
    const m = votes.get(key) ?? new Map<string, number>();
    m.set(line, (m.get(line) ?? 0) + 1);
    votes.set(key, m);
  }
  const rows = [...votes]
    .map(([k, m]) => [k, [...m].sort((a, b) => b[1] - a[1])[0]![0]] as const)
    .sort((a, b) => a[0].localeCompare(b[0], "en", { numeric: true }));
  const out = join(DATA, `lines-${year}.toml`);
  writeFileSync(
    out,
    `# regional line per train, from the ÖBB GTFS route_short_name (CC BY 4.0); built by packages/trains/src/lines.ts\n${rows
      .map(([k, l]) => `${JSON.stringify(k)} = ${JSON.stringify(l)}`)
      .join("\n")}\n`,
  );
  console.log(`lines: ${rows.length} trains with a line → ${out} (${t()})`);
}

if (import.meta.main) await main();
