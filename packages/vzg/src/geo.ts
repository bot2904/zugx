/** Geometry helpers for the line maps: simplification and Google polyline encoding (1e5). */
type Coord = [number, number];

/** Douglas–Peucker in metres (local equirectangular projection) */
export function simplify(pts: Coord[], tolM: number): Coord[] {
  if (pts.length < 3) return pts;
  const lat0 = (pts[0]![0] * Math.PI) / 180;
  const xy = pts.map(([la, lo]) => [lo * 111320 * Math.cos(lat0), la * 110540] as const);
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = xy[a]!;
    const [bx, by] = xy[b]!;
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    let best = -1;
    let dmax = tolM;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = xy[i]!;
      const d = Math.abs(dy * px - dx * py + bx * ay - by * ax) / len;
      if (d > dmax) {
        dmax = d;
        best = i;
      }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Google encoded polyline, precision 1e5 (decode with @zugx/hafas decodePolyline) */
export function encodePolyline(pts: Coord[]): string {
  let out = "";
  let pLat = 0;
  let pLon = 0;
  const enc = (v: number) => {
    let n = v < 0 ? ~(v << 1) : v << 1;
    while (n >= 0x20) {
      out += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
      n >>= 5;
    }
    out += String.fromCharCode(n + 63);
  };
  for (const [la, lo] of pts) {
    const lat = Math.round(la * 1e5);
    const lon = Math.round(lo * 1e5);
    enc(lat - pLat);
    enc(lon - pLon);
    pLat = lat;
    pLon = lon;
  }
  return out;
}

export function decodePolyline(str: string): Coord[] {
  const out: Coord[] = [];
  let i = 0;
  let lat = 0;
  let lon = 0;
  const next = () => {
    let r = 0;
    let shift = 0;
    let b: number;
    do {
      b = str.charCodeAt(i++) - 63;
      r |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    return r & 1 ? ~(r >> 1) : r >> 1;
  };
  while (i < str.length) {
    lat += next();
    lon += next();
    out.push([lat / 1e5, lon / 1e5]);
  }
  return out;
}
