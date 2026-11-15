/**
 * Permitted speed between two stations from the VzG data: used to spread a train's running time
 * between two stops over the stations it passes (slow sections take longer, fast ones less)
 * instead of evenly by distance. Stations are linked by position: the VzG station, halt and stop
 * points within 400 m.
 */
import type { VzgLine, VzgTrack } from "./types.ts";

type Coord = [number, number];
const distKm = (a: Coord, b: Coord) => {
  const dLat = (b[0] - a[0]) * 111.32;
  const dLon = (b[1] - a[1]) * 111.32 * Math.cos(((a[0] + b[0]) / 2) * (Math.PI / 180));
  return Math.hypot(dLat, dLon);
};

/**
 * `(posA, posB, vmax, lengthKm)` → average speed in km/h a train can run between the two
 * stations (time at the permitted speed, capped at the train's `vmax`), or undefined if no VzG
 * track has both.
 */
export function speedLookup(lines: VzgLine[], maxKm = 0.4) {
  const pts: { track: VzgTrack; km: number; pos: Coord }[] = [];
  for (const l of lines)
    for (const track of l.tracks)
      for (const p of track.points) if (p.pos) pts.push({ track, km: p.km, pos: p.pos });
  const near = new Map<string, { track: VzgTrack; km: number }[]>();
  const around = (c: Coord) => {
    const key = c.join();
    let r = near.get(key);
    if (!r) {
      // per track the closest point
      const best = new Map<VzgTrack, { km: number; d: number }>();
      for (const p of pts) {
        if (Math.abs(p.pos[0] - c[0]) > 0.01) continue;
        const d = distKm(p.pos, c);
        if (d <= maxKm && d < (best.get(p.track)?.d ?? Infinity))
          best.set(p.track, { km: p.km, d });
      }
      r = [...best].map(([track, { km }]) => ({ track, km }));
      near.set(key, r);
    }
    return r;
  };
  return (a: Coord, b: Coord, vmax: number, lengthKm?: number): number | undefined => {
    const bs = around(b);
    let best: { v: number; err: number } | undefined;
    for (const x of around(a))
      for (const y of bs) {
        if (x.track !== y.track || x.km === y.km) continue;
        const v = averageSpeed(x.track, x.km, y.km, vmax);
        if (v === undefined) continue;
        // several tracks with both stations (e.g. old and new line): the one whose length fits
        const err = lengthKm ? Math.abs(Math.abs(y.km - x.km) - lengthKm) : 0;
        if (!best || err < best.err) best = { v, err };
      }
    return best?.v;
  };
}

/** average speed from km `a` to km `b` on a track (direction from their order), km/h */
export function averageSpeed(track: VzgTrack, a: number, b: number, vmax: number) {
  const up = b > a;
  const [lo, hi] = up ? [a, b] : [b, a];
  let hours = 0;
  let covered = 0;
  for (const [f, t, vUp, vDown] of track.speeds) {
    const len = Math.min(hi, t) - Math.max(lo, f);
    if (len <= 0) continue;
    const v = Math.min(vmax, (up ? vUp : vDown) ?? vmax);
    hours += len / Math.max(v, 5);
    covered += len;
  }
  // gaps without speed data: at vmax
  hours += Math.max(0, hi - lo - covered) / vmax;
  return hours > 0 ? (hi - lo) / hours : undefined;
}

/**
 * VzG lines running through a set of stations (by position, within `maxKm` of a station, halt or
 * stop point of the line), with the number of stations on each; most stations first. Lines with
 * fewer than three of the stations are dropped (short connectors, light rail beside a station).
 */
export function linesThrough(lines: VzgLine[], stations: Coord[], maxKm = 0.25) {
  const count = new Map<VzgLine, number>();
  for (const l of lines) {
    const pts = l.tracks.flatMap((t) => t.points.flatMap((p) => (p.pos ? [p.pos] : [])));
    const n = stations.filter((s) =>
      pts.some((p) => Math.abs(p[0] - s[0]) < 0.01 && distKm(p, s) <= maxKm),
    ).length;
    if (n >= 3) count.set(l, n);
  }
  return [...count]
    .sort((a, b) => b[1] - a[1] || (a[0].ref ?? a[0].id).localeCompare(b[0].ref ?? b[0].id))
    .map(([l, n]) => ({
      id: l.id,
      ...(l.ref ? { ref: l.ref } : {}),
      ...(l.name ? { name: l.name } : {}),
      stations: n,
    }));
}

/**
 * Main signals (block boundaries) between two stations: `(posA, posB, lengthKm)` → each main or
 * combined signal on the VzG track that has both stations, as the fraction `f` of the way from A
 * to B and the direction it applies to (1 = trains from A towards B, −1 = from B towards A); per
 * direction the Regelgleis of that direction where a line has two. Plus the stations in between
 * (OSM railway=station, also operational stations without passenger stops: crossing places).
 * Undefined if no track has both.
 */
export function signalLookup(lines: VzgLine[], maxKm = 0.4) {
  const pts: { track: VzgTrack; line: VzgLine; km: number; pos: Coord }[] = [];
  for (const l of lines)
    for (const track of l.tracks)
      for (const p of track.points) if (p.pos) pts.push({ track, line: l, km: p.km, pos: p.pos });
  const around = (c: Coord) => {
    const best = new Map<VzgTrack, { line: VzgLine; km: number; d: number }>();
    for (const p of pts) {
      if (Math.abs(p.pos[0] - c[0]) > 0.01) continue;
      const d = distKm(p.pos, c);
      if (d <= maxKm && d < (best.get(p.track)?.d ?? Infinity))
        best.set(p.track, { line: p.line, km: p.km, d });
    }
    return best;
  };
  return (a: Coord, b: Coord, lengthKm?: number) => {
    const A = around(a);
    const B = around(b);
    // the line (both its tracks) whose length between the stations fits best
    let best: { line: VzgLine; err: number } | undefined;
    for (const [t, x] of A) {
      const y = B.get(t);
      if (!y || x.km === y.km) continue;
      const err = lengthKm ? Math.abs(Math.abs(y.km - x.km) - lengthKm) : 0;
      if (!best || err < best.err) best = { line: x.line, err };
    }
    if (!best) return undefined;
    const out: { f: number; dir: 1 | -1 }[] = [];
    const places: number[] = [];
    const tracks = best.line.tracks.filter((t) => A.has(t) && B.has(t));
    for (const rel of [1, -1] as const) {
      for (const t of tracks) {
        const ka = A.get(t)!.km;
        const kb = B.get(t)!.km;
        const up = kb > ka ? 1 : -1; // line km grows from A to B
        const lineDir = (rel * up) as 1 | -1; // the direction in line-km terms
        // double track: the Regelgleis of this direction ("1" = towards increasing km)
        if (tracks.length > 1 && t.track !== (lineDir === 1 ? "1" : "2")) continue;
        for (const p of t.points) {
          if (p.kind !== "signal" || p.dir !== lineDir || !/main|combined/.test(p.signal ?? ""))
            continue;
          const f = (p.km - ka) / (kb - ka);
          if (f > 0.001 && f < 0.999) out.push({ f, dir: rel });
        }
      }
    }
    const t = tracks[0]!;
    const [ka, kb] = [A.get(t)!.km, B.get(t)!.km];
    for (const p of t.points)
      if (p.kind === "station") {
        const f = (p.km - ka) / (kb - ka);
        if (f > 0.02 && f < 0.98) places.push(f);
      }
    return { signals: out, places };
  };
}
