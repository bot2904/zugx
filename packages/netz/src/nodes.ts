/**
 * Curated Netzgrafik nodes (Knoten). Candidates come from the data (see
 * `nodeCandidates`), but the list is fixed by hand so the graph stays readable.
 * Codes are zugx-internal short names (unique, used as NGE betriebspunktName).
 */
import type { Feed } from "./gtfs.ts";

export interface NodeDef {
  id: string;
  code: string;
  /** display name override (otherwise the GTFS name, shortened) */
  name?: string;
}

export const NODES: NodeDef[] = [
  // Wien
  { id: "Pat:49:1349", code: "WHB", name: "Wien Hbf" },
  { id: "Pat:49:1015", code: "WME", name: "Wien Meidling" },
  { id: "Pat:49:1468", code: "WWB", name: "Wien Westbf" },
  { id: "Pat:49:334", code: "WFL", name: "Wien Floridsdorf" },
  { id: "Pat:43:4708", code: "VIE", name: "Flughafen Wien" },
  // Westbahn
  { id: "Pat:43:4848", code: "STP", name: "St. Pölten Hbf" },
  { id: "Pat:43:7234", code: "AMS", name: "Amstetten" },
  { id: "Pat:43:7242", code: "SVA", name: "St. Valentin" },
  { id: "Pat:44:41164", code: "LZ", name: "Linz Hbf" },
  { id: "Pat:44:42107", code: "WEL", name: "Wels Hbf" },
  { id: "Pat:44:47200", code: "ATT", name: "Attnang-Puchheim" },
  { id: "Pat:45:50002", code: "SBG", name: "Salzburg Hbf" },
  // Tauern / Giselabahn
  { id: "Pat:45:52099", code: "BIS", name: "Bischofshofen" },
  { id: "Pat:45:52197", code: "SSV", name: "Schwarzach-St. Veit" },
  { id: "Pat:45:54104", code: "ZAS", name: "Zell am See" },
  { id: "Pat:42:2128", code: "SPI", name: "Spittal-Millstätter See" },
  // Tirol / Vorarlberg
  { id: "Pat:47:1170", code: "WÖR", name: "Wörgl Hbf" },
  { id: "Pat:47:2184", code: "KUF", name: "Kufstein" },
  { id: "Pat:47:61321", code: "JEN", name: "Jenbach" },
  { id: "Pat:47:1187", code: "IBK", name: "Innsbruck Hbf" },
  { id: "Pit:22021:1389", code: "BRN", name: "Brennero/Brenner" },
  { id: "Pat:47:1212", code: "LAN", name: "Landeck-Zams" },
  { id: "Pat:48:130", code: "BLU", name: "Bludenz" },
  { id: "Pat:48:817", code: "FEL", name: "Feldkirch" },
  { id: "Pat:48:452", code: "BRE", name: "Bregenz" },
  { id: "Pch:23016:20302", code: "BUC", name: "Buchs SG" },
  // Südbahn / Steiermark / Kärnten
  { id: "Pat:43:5210", code: "WRN", name: "Wiener Neustadt Hbf" },
  { id: "Pat:46:7426", code: "MÜR", name: "Mürzzuschlag" },
  { id: "Pat:46:2065", code: "BRM", name: "Bruck/Mur" },
  { id: "Pat:46:6344", code: "LEO", name: "Leoben Hbf" },
  { id: "Pat:46:6938", code: "SEL", name: "Selzthal" },
  { id: "Pat:46:3040", code: "GRZ", name: "Graz Hbf" },
  { id: "Pat:46:1839", code: "SPF", name: "Spielfeld-Straß" },
  { id: "Pat:46:30077", code: "WST", name: "Weststeiermark" },
  { id: "Pat:42:3642", code: "KLU", name: "Klagenfurt Hbf" },
  { id: "Pat:42:3654", code: "VIL", name: "Villach Hbf" },
  // Nord / Ost
  { id: "Pat:43:3993", code: "KRE", name: "Krems" },
  { id: "Pat:43:7169", code: "GMÜ", name: "Gmünd NÖ" },
  { id: "Pat:44:45260", code: "SUM", name: "Summerau" },
  { id: "Pcz:0:5433425", code: "BRV", name: "Břeclav" },
  { id: "Pat:43:3209", code: "BRL", name: "Bruck/Leitha" },
  { id: "Pat:41:4351", code: "NEU", name: "Neusiedl am See" },
  { id: "Phu:17905:27000493", code: "HEG", name: "Hegyeshalom" },
  // Deutschland
  { id: "Pde:09262:156", code: "PAS", name: "Passau Hbf" },
  { id: "Pde:09163:9", code: "ROS", name: "Rosenheim" },
  { id: "Pde:09162:100", code: "MÜN", name: "München Hbf" },
];

/**
 * Data-driven candidates: stations ranked by departures of the given categories
 * on the reference day, with the number of distinct neighbouring stations.
 * Printed by the build to help curate {@link NODES}.
 */
export function nodeCandidates(feed: Feed, cats: Set<string>, limit = 60) {
  const deps = new Map<string, number>();
  const nb = new Map<string, Set<string>>();
  for (const t of feed.trips) {
    if (!cats.has(t.cat)) continue;
    t.stops.forEach((s, i) => {
      deps.set(s.st, (deps.get(s.st) ?? 0) + 1);
      let set = nb.get(s.st);
      if (!set) nb.set(s.st, (set = new Set()));
      const prev = t.stops[i - 1];
      const next = t.stops[i + 1];
      if (prev) set.add(prev.st);
      if (next) set.add(next.st);
    });
  }
  return [...deps]
    .map(([id, n]) => ({
      id,
      name: feed.stations.get(id)?.name ?? id,
      deps: n,
      neighbours: nb.get(id)?.size ?? 0,
    }))
    .sort((a, b) => b.deps - a.deps)
    .slice(0, limit);
}
