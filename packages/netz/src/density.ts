/**
 * Traffic density: trains per day on each 1-km section of the VzG lines. Every trip of the day
 * is sampled along its GTFS shape every 500 m; a sample counts for the nearest km section (between
 * two km posts of a VzG line) within 400 m. Each trip counts once per section.
 */
import type { VzgLine } from "@zugx/vzg";
import type { Shape, Trip } from "./gtfs.ts";

type Coord = [number, number];
interface Section {
  line: string;
  /** km of the post where the section starts (whole km) */
  km: number;
  a: Coord;
  b: Coord;
}

const KM_LAT = 111.32;

/** distance (km) from p to the segment a–b, local equirectangular */
function segDist(p: Coord, a: Coord, b: Coord, kx: number): number {
  const ax = a[1] * kx;
  const ay = a[0];
  const bx = b[1] * kx;
  const by = b[0];
  const px = p[1] * kx;
  const py = p[0];
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy || 1e-12;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) * KM_LAT;
}

export interface Density {
  /** reference day */
  day: string;
  /** per line: section start km → trains on the day */
  lines: { id: string; km: number[]; n: number[] }[];
}

export function trafficDensity(
  lines: VzgLine[],
  trips: Trip[],
  shapes: Map<string, Shape>,
  day: string,
  maxKm = 0.4,
  stepKm = 0.5,
): Density {
  // km sections from consecutive whole-km posts of each line's first track, in a 0.02° grid
  const grid = new Map<string, Section[]>();
  const cell = (la: number, lo: number) => `${Math.floor(la / 0.02)},${Math.floor(lo / 0.02)}`;
  for (const l of lines) {
    const posts = l.tracks[0]?.geo?.posts ?? [];
    for (let i = 1; i < posts.length; i++) {
      const [k0, la0, lo0] = posts[i - 1]!;
      const [k1, la1, lo1] = posts[i]!;
      if (Math.abs(k1 - k0) !== 1) continue;
      const s: Section = { line: l.id, km: Math.min(k0, k1), a: [la0, lo0], b: [la1, lo1] };
      const cells = new Set([cell(la0, lo0), cell(la1, lo1)]);
      for (const c of cells) {
        const list = grid.get(c) ?? [];
        list.push(s);
        grid.set(c, list);
      }
    }
  }
  const near = (p: Coord): Section | undefined => {
    const kx = Math.cos((p[0] * Math.PI) / 180);
    const ci = Math.floor(p[0] / 0.02);
    const cj = Math.floor(p[1] / 0.02);
    let best: Section | undefined;
    let dmin = maxKm;
    for (let i = ci - 1; i <= ci + 1; i++)
      for (let j = cj - 1; j <= cj + 1; j++)
        for (const s of grid.get(`${i},${j}`) ?? []) {
          const d = segDist(p, s.a, s.b, kx);
          if (d < dmin) {
            dmin = d;
            best = s;
          }
        }
    return best;
  };
  const counts = new Map<string, number>();
  for (const trip of trips) {
    const sh = trip.shape ? shapes.get(trip.shape) : undefined;
    if (!sh || sh.lat.length < 2) continue;
    const hit = new Set<string>();
    // resample the shape every stepKm along its polyline
    let carry = 0;
    for (let i = 1; i < sh.lat.length; i++) {
      const a: Coord = [sh.lat[i - 1]!, sh.lon[i - 1]!];
      const b: Coord = [sh.lat[i]!, sh.lon[i]!];
      const kx = Math.cos((a[0] * Math.PI) / 180);
      const len = Math.hypot((b[0] - a[0]) * KM_LAT, (b[1] - a[1]) * KM_LAT * kx);
      for (let s = carry; s < len; s += stepKm) {
        const f = len ? s / len : 0;
        const sec = near([a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1])]);
        if (sec) hit.add(`${sec.line}@${sec.km}`);
      }
      carry = (((carry - len) % stepKm) + stepKm) % stepKm;
    }
    for (const k of hit) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const byLine = new Map<string, [number, number][]>();
  for (const [k, n] of counts) {
    const [id, km] = k.split("@") as [string, string];
    const list = byLine.get(id) ?? [];
    list.push([Number(km), n]);
    byLine.set(id, list);
  }
  return {
    day,
    lines: [...byLine]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([id, list]) => {
        list.sort((x, y) => x[0] - y[0]);
        return { id, km: list.map((x) => x[0]), n: list.map((x) => x[1]) };
      }),
  };
}
