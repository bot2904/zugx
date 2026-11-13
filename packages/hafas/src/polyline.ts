// Decode a Google-encoded polyline (HAFAS `crdEncYX`: lat/lon pairs, precision 1e5).
// HAFAS uses "?" as a zero delta (char code 63 → value 0).
export function decodePolyline(str: string, precision = 5): [number, number][] {
  const factor = 10 ** precision;
  const out: [number, number][] = [];
  let i = 0;
  let lat = 0;
  let lon = 0;
  const next = (): number => {
    let result = 0;
    let shift = 0;
    let b: number;
    do {
      b = str.charCodeAt(i++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20 && i < str.length);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (i < str.length) {
    lat += next();
    if (i >= str.length) break;
    lon += next();
    out.push([lat / factor, lon / factor]);
  }
  return out;
}
