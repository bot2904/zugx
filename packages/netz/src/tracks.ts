/**
 * Single or double track along a Bildfahrplan corridor: for each pair of neighbouring corridor
 * stations, the GTFS shape of a train running between them is sampled every 100 m; each sample
 * takes the track count of the nearest OSM track of the sheet's lines (in the Austrian OSM data
 * each track of a double-track line carries `railway:preferred_direction` forward/backward,
 * single-track lines none). Samples map linearly onto the corridor km between the two stations;
 * runs of equal count are merged, runs under 300 m dropped (switches, station throats).
 */
import { decodePolyline } from "@zugx/vzg/geo";
import type { Shape, Trip } from "./gtfs.ts";
import type { CorridorStation } from "./types.ts";

type Coord = [number, number];
interface Seg {
  a: Coord;
  b: Coord;
  tr: number;
}
const KM_LAT = 111.32;
const CELL = 0.01;

function segDist(p: Coord, a: Coord, b: Coord, kx: number): number {
  const dx = (b[1] - a[1]) * kx;
  const dy = b[0] - a[0];
  const px = (p[1] - a[1]) * kx;
  const py = p[0] - a[0];
  const l2 = dx * dx + dy * dy || 1e-12;
  const t = Math.max(0, Math.min(1, (px * dx + py * dy) / l2));
  return Math.hypot(px - t * dx, py - t * dy) * KM_LAT;
}

/** OSM track ways (osm-rail.json of @zugx/vzg) with their line ref and preferred direction */
export interface RailWays {
  ways: { nodes: number[]; tags: Record<string, string> }[];
  coords: Record<string, Coord>;
}
/** polylines with a track count: the main/branch line tracks of the given line refs */
export function wayTracks(ex: RailWays, refs: Set<string>): { pts: Coord[]; tr: number }[] {
  return ex.ways.flatMap((w) => {
    const t = w.tags;
    if (!refs.has(t.ref ?? "") || t.service || (t.usage !== "main" && t.usage !== "branch"))
      return [];
    const pd = t["railway:preferred_direction"];
    const pts = w.nodes.map((n) => ex.coords[n]).filter((c): c is Coord => !!c);
    return pts.length > 1 ? [{ pts, tr: pd === "forward" || pd === "backward" ? 2 : 1 }] : [];
  });
}
/** VzG network pieces as polylines with a track count (fallback without the OSM extract) */
export const pieceTracks = (pieces: { line: string; tr: number }[]) =>
  pieces.map((p) => ({ pts: decodePolyline(p.line), tr: p.tr }));

/** nearest-track lookup of the track count (undefined if no track within `maxKm`) */
export function trackLookup(
  lines: { pts: Coord[]; tr: number }[],
  maxKm = 0.05,
): (p: Coord) => number | undefined {
  const grid = new Map<string, Seg[]>();
  for (const pc of lines) {
    const pts = pc.pts;
    for (let i = 1; i < pts.length; i++) {
      const s: Seg = { a: pts[i - 1]!, b: pts[i]!, tr: pc.tr };
      // every cell the segment's bounding box touches
      const [la0, la1] = [Math.min(s.a[0], s.b[0]), Math.max(s.a[0], s.b[0])];
      const [lo0, lo1] = [Math.min(s.a[1], s.b[1]), Math.max(s.a[1], s.b[1])];
      for (let i0 = Math.floor(la0 / CELL); i0 <= Math.floor(la1 / CELL); i0++)
        for (let j0 = Math.floor(lo0 / CELL); j0 <= Math.floor(lo1 / CELL); j0++) {
          const k = `${i0},${j0}`;
          const list = grid.get(k) ?? [];
          list.push(s);
          grid.set(k, list);
        }
    }
  }
  return (p) => {
    const kx = Math.cos((p[0] * Math.PI) / 180);
    const ci = Math.floor(p[0] / CELL);
    const cj = Math.floor(p[1] / CELL);
    let best: number | undefined;
    let dmin = maxKm;
    for (let i = ci - 1; i <= ci + 1; i++)
      for (let j = cj - 1; j <= cj + 1; j++)
        for (const s of grid.get(`${i},${j}`) ?? []) {
          const d = segDist(p, s.a, s.b, kx);
          // the higher count wins among (nearly) equally close pieces: the two tracks of a
          // double-track line are separate pieces 4 m apart
          if (d < dmin - 0.005 || (d < dmin + 0.005 && s.tr > (best ?? 0))) {
            dmin = Math.min(dmin, d);
            best = s.tr;
          }
        }
    return best;
  };
}

/**
 * For each pair of stations served consecutively: the trip whose shape has the most points
 * between them (some GTFS shapes are coarse, a chord between the stations can come closer to a
 * neighbouring line than to the own one)
 */
export function pairTrips(
  trips: Trip[],
  shapes: Map<string, Shape>,
): Map<string, { trip: Trip; i: number }> {
  const out = new Map<string, { trip: Trip; i: number; n: number }>();
  const seen = new Set<string>();
  for (const trip of trips) {
    const sh = trip.shape ? shapes.get(trip.shape) : undefined;
    if (!sh) continue;
    for (let i = 0; i + 1 < trip.stops.length; i++) {
      const a = trip.stops[i]!;
      const b = trip.stops[i + 1]!;
      if (!Number.isFinite(a.dist) || !Number.isFinite(b.dist) || !(b.dist > a.dist)) continue;
      const k = `${a.st}|${b.st}`;
      // one count per shape and pair
      if (seen.has(`${k}|${trip.shape}`)) continue;
      seen.add(`${k}|${trip.shape}`);
      let n = 0;
      for (const d of sh.dist) if (d > a.dist && d < b.dist) n++;
      if (n > (out.get(k)?.n ?? -1)) out.set(k, { trip, i, n });
    }
  }
  return out;
}

/** points of a shape between two positions (shape_dist_traveled, m), every `stepM` */
function sampleShape(sh: Shape, fromM: number, toM: number, stepM: number): Coord[] {
  const out: Coord[] = [];
  let i = 0;
  for (let m = fromM; m <= toM; m += stepM) {
    while (i + 1 < sh.dist.length - 1 && sh.dist[i + 1]! < m) i++;
    const d0 = sh.dist[i]!;
    const d1 = sh.dist[i + 1] ?? d0;
    const f = d1 > d0 ? Math.max(0, Math.min(1, (m - d0) / (d1 - d0))) : 0;
    out.push([
      sh.lat[i]! + f * ((sh.lat[i + 1] ?? sh.lat[i]!) - sh.lat[i]!),
      sh.lon[i]! + f * ((sh.lon[i + 1] ?? sh.lon[i]!) - sh.lon[i]!),
    ]);
  }
  return out;
}

/** [km from, km to, track count] along the corridor (corridor km) */
export function corridorTracks(
  stations: CorridorStation[],
  pairs: Map<string, { trip: Trip; i: number }>,
  shapes: Map<string, Shape>,
  lookup: (p: Coord) => number | undefined,
): [number, number, number][] {
  const samples: [number, number][] = []; // [km, tr]
  for (let k = 0; k + 1 < stations.length; k++) {
    const sa = stations[k]!;
    const sb = stations[k + 1]!;
    const fwd = pairs.get(`${sa.id}|${sb.id}`);
    const rev = fwd ? undefined : pairs.get(`${sb.id}|${sa.id}`);
    const hit = fwd ?? rev;
    const sh = hit?.trip.shape ? shapes.get(hit.trip.shape) : undefined;
    if (!hit || !sh) continue;
    const m0 = hit.trip.stops[hit.i]!.dist;
    const m1 = hit.trip.stops[hit.i + 1]!.dist;
    const pts = sampleShape(sh, m0, m1, 100);
    pts.forEach((p, j) => {
      const tr = lookup(p);
      if (tr === undefined) return;
      const f = pts.length > 1 ? j / (pts.length - 1) : 0;
      // the trip may run against the corridor order
      const ff = fwd ? f : 1 - f;
      samples.push([sa.km + ff * (sb.km - sa.km), tr]);
    });
  }
  samples.sort((x, y) => x[0] - y[0]);
  // runs of equal count; a gap of > 1 km without samples ends a run
  const runs: [number, number, number][] = [];
  for (const [km, tr] of samples) {
    const last = runs.at(-1);
    if (last && last[2] === tr && km - last[1] <= 1) last[1] = km;
    else runs.push([km, km, tr]);
  }
  // drop short runs (< 300 m) and merge the neighbours they separated
  const out: [number, number, number][] = [];
  for (const r of runs) {
    if (r[1] - r[0] < 0.3) continue;
    const last = out.at(-1);
    if (last && last[2] === r[2] && r[0] - last[1] <= 1) last[1] = r[1];
    else out.push([...r]);
  }
  const round = (v: number) => Math.round(v * 100) / 100;
  return out.map(([a, b, n]) => [round(a), round(b), n]);
}
