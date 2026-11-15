/**
 * Connecting lines per line: at which of its stations (Bahnhöfe) other lines meet it, matched by
 * position (a station, halt or stop point of the other line within `maxKm`). Only "major" lines
 * (≥ 5 km), no short connectors or junctions on open track. A line running alongside for several
 * stations is listed where it joins and where it leaves.
 */
import type { VzgConnection, VzgLine } from "./types.ts";

type Coord = [number, number];
const distKm = (a: Coord, b: Coord) => {
  const dLat = (b[0] - a[0]) * 111.32;
  const dLon = (b[1] - a[1]) * 111.32 * Math.cos(((a[0] + b[0]) / 2) * (Math.PI / 180));
  return Math.hypot(dLat, dLon);
};

/** station name for comparisons: "Salzburg Hauptbahnhof (S-Bahn)" = "Salzburg Hbf" */
export function stationKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\u202f|\u00a0/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\bhauptbahnhof\b/g, "hbf")
    .replace(/\bbahnhof\b|\bbf\b|\bbahnhst\b|\bhaltestelle\b/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const STATIONISH = new Set(["station", "halt", "stop"]);

export function connections(lines: VzgLine[], maxKm = 1, minLengthKm = 5) {
  const major = lines.filter((l) => Math.max(...l.tracks.map((t) => t.length)) >= minLengthKm);
  // every major line's station-like points by name (first track; the others share the stations)
  const byName = new Map<string, { line: VzgLine; km: number; pos: Coord }[]>();
  for (const l of major)
    for (const p of l.tracks[0]?.points ?? []) {
      if (!p.pos || !p.label || !STATIONISH.has(p.kind)) continue;
      const k = stationKey(p.label);
      const list = byName.get(k) ?? [];
      if (!list.some((x) => x.line === l)) list.push({ line: l, km: p.km, pos: p.pos });
      byName.set(k, list);
    }
  const out = new Map<VzgLine, VzgConnection[]>();
  for (const l of lines) {
    const seen = new Set<string>();
    const list: VzgConnection[] = [];
    for (const p of l.tracks[0]?.points ?? []) {
      if (!p.pos || !p.label || !STATIONISH.has(p.kind)) continue;
      const k = stationKey(p.label);
      if (seen.has(k)) continue;
      seen.add(k);
      // the same station (same name, nearby) on other lines
      const other = (byName.get(k) ?? []).filter(
        (q) => q.line !== l && distKm(q.pos, p.pos!) <= maxKm,
      );
      if (other.length)
        list.push({
          km: p.km,
          station: p.label.replace(/\s*\([^)]*\)/g, ""),
          lines: other
            .sort((a, b) => (a.line.ref ?? a.line.id).localeCompare(b.line.ref ?? b.line.id))
            .map(({ line: o, km }) => ({
              id: o.id,
              ...(o.ref ? { ref: o.ref } : {}),
              ...(o.name ? { name: o.name } : {}),
              km,
            })),
        });
    }
    // a line running alongside for several stations: only where it joins and where it leaves
    const at = new Map<string, number[]>();
    list.forEach((c, i) => c.lines.forEach((o) => at.set(o.id, [...(at.get(o.id) ?? []), i])));
    for (const [id, idx] of at)
      if (idx.length >= 3)
        for (const i of idx.slice(1, -1))
          list[i]!.lines = list[i]!.lines.filter((o) => o.id !== id);
    const kept = list.filter((c) => c.lines.length);
    if (kept.length) out.set(l, kept);
  }
  return out;
}
