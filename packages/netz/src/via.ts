/**
 * Which railway line a train actually runs on between two of its corridor stations — for sheets
 * where two lines run side by side (e.g. Unterinntal: old line 101 04 above ground, new line
 * 330 01 mostly in tunnels). The train's GTFS shape between the two stops is sampled every 250 m;
 * each sample takes the nearest VzG line (geometry within 60 m); the majority wins. Plus helpers to
 * place a line's signals on the corridor's km axis.
 */
import type { VzgLine } from "@zugx/vzg";
import { decodePolyline } from "@zugx/vzg/geo";
import type { Shape } from "./gtfs.ts";

type Coord = [number, number];
const KM_LAT = 111.32;
const CELL = 0.01;

function segDist(p: Coord, a: Coord, b: Coord): { d: number; f: number } {
  const kx = Math.cos((p[0] * Math.PI) / 180);
  const dx = (b[1] - a[1]) * kx;
  const dy = b[0] - a[0];
  const px = (p[1] - a[1]) * kx;
  const py = p[0] - a[0];
  const l2 = dx * dx + dy * dy || 1e-12;
  const f = Math.max(0, Math.min(1, (px * dx + py * dy) / l2));
  return { d: Math.hypot(px - f * dx, py - f * dy) * KM_LAT, f };
}

/** nearest VzG line (id) to a point, within `maxKm` */
export function lineFinder(lines: VzgLine[], maxKm = 0.06) {
  const grid = new Map<string, { a: Coord; b: Coord; id: string }[]>();
  for (const l of lines) {
    const g = l.tracks[0]?.geo;
    if (!g) continue;
    for (const s of g.segments) {
      const pts = decodePolyline(s.line);
      for (let i = 1; i < pts.length; i++) {
        const seg = { a: pts[i - 1]!, b: pts[i]!, id: l.id };
        const [la0, la1] = [Math.min(seg.a[0], seg.b[0]), Math.max(seg.a[0], seg.b[0])];
        const [lo0, lo1] = [Math.min(seg.a[1], seg.b[1]), Math.max(seg.a[1], seg.b[1])];
        for (let x = Math.floor(la0 / CELL); x <= Math.floor(la1 / CELL); x++)
          for (let y = Math.floor(lo0 / CELL); y <= Math.floor(lo1 / CELL); y++) {
            const k = `${x},${y}`;
            const list = grid.get(k) ?? [];
            list.push(seg);
            grid.set(k, list);
          }
      }
    }
  }
  return (p: Coord): string | undefined => {
    const cx = Math.floor(p[0] / CELL);
    const cy = Math.floor(p[1] / CELL);
    let best: string | undefined;
    let dmin = maxKm;
    for (let x = cx - 1; x <= cx + 1; x++)
      for (let y = cy - 1; y <= cy + 1; y++)
        for (const s of grid.get(`${x},${y}`) ?? []) {
          const { d } = segDist(p, s.a, s.b);
          if (d < dmin) [dmin, best] = [d, s.id];
        }
    return best;
  };
}

/** the line a shape runs on between two positions along it (metres), by majority of samples */
export function shapeLine(
  find: (p: Coord) => string | undefined,
  sh: Shape,
  fromM: number,
  toM: number,
  stepM = 250,
): string | undefined {
  const votes = new Map<string, number>();
  let i = 0;
  // leave out the station areas at both ends (junctions, parallel station tracks)
  for (let m = fromM + 500; m <= toM - 500; m += stepM) {
    while (i + 1 < sh.dist.length - 1 && sh.dist[i + 1]! < m) i++;
    const d0 = sh.dist[i]!;
    const d1 = sh.dist[i + 1] ?? d0;
    const f = d1 > d0 ? Math.max(0, Math.min(1, (m - d0) / (d1 - d0))) : 0;
    const p: Coord = [
      sh.lat[i]! + f * ((sh.lat[i + 1] ?? sh.lat[i]!) - sh.lat[i]!),
      sh.lon[i]! + f * ((sh.lon[i + 1] ?? sh.lon[i]!) - sh.lon[i]!),
    ];
    const id = find(p);
    if (id) votes.set(id, (votes.get(id) ?? 0) + 1);
  }
  let best: string | undefined;
  let n = 0;
  let total = 0;
  for (const [id, v] of votes) {
    total += v;
    if (v > n) [best, n] = [id, v];
  }
  // a clear majority only (where two lines run side by side, samples go either way)
  return n >= 3 && n / total >= 0.6 ? best : undefined;
}

/** position of a line at km `k` (interpolated between its whole-km posts) */
export function linePosAt(line: VzgLine, k: number): Coord | undefined {
  const posts = line.tracks[0]?.geo?.posts ?? [];
  for (let i = 1; i < posts.length; i++) {
    const [k0, la0, lo0] = posts[i - 1]!;
    const [k1, la1, lo1] = posts[i]!;
    if ((k - k0) * (k - k1) <= 0 && k0 !== k1) {
      const f = (k - k0) / (k1 - k0);
      return [la0 + f * (la1 - la0), lo0 + f * (lo1 - lo0)];
    }
  }
  return undefined;
}

/**
 * corridor km of a position: projected onto the polyline of the corridor stations (their
 * coordinates and km); undefined if farther than `maxKm` from it
 */
export function corridorKmAt(stations: { pos: Coord; km: number }[], p: Coord, maxKm = 3) {
  let best: { d: number; km: number } | undefined;
  for (let i = 1; i < stations.length; i++) {
    const a = stations[i - 1]!;
    const b = stations[i]!;
    const { d, f } = segDist(p, a.pos, b.pos);
    if (!best || d < best.d) best = { d, km: a.km + f * (b.km - a.km) };
  }
  return best && best.d <= maxKm ? best.km : undefined;
}

/** km of a line at the point of its (whole-km posts) path nearest to `p` */
export function lineKmAt(line: VzgLine, p: Coord): number | undefined {
  const posts = line.tracks[0]?.geo?.posts ?? [];
  let best: { d: number; km: number } | undefined;
  for (let i = 1; i < posts.length; i++) {
    const [k0, la0, lo0] = posts[i - 1]!;
    const [k1, la1, lo1] = posts[i]!;
    const { d, f } = segDist(p, [la0, lo0], [la1, lo1]);
    if (!best || d < best.d) best = { d, km: k0 + f * (k1 - k0) };
  }
  return best && best.d < 1.5 ? best.km : undefined;
}
