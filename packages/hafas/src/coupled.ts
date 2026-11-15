/**
 * Coupled train parts (Zugteile): night trains and Railjets often run as several commercial
 * trains joined into one (EN 40462 = EC 462 Budapest–Salzburg, then NJ 466 Salzburg–Zürich).
 * HAFAS returns one radar movement per commercial part, all at the same position.
 */
import type { Line, Movement } from "./types.ts";

/** commercial-only train numbers (night-train car groups 40xxx–69xxx): never run on their own */
export const isCommercialNumber = (n: string) => /^\d{5}$/.test(n) && Number(n) >= 40000;

/**
 * order of the parts of one train set: the likely operational train first — commercial-only
 * numbers last, then the lower number (RJX 61 before RJX 19981, RJX 60 before RJX 13470)
 */
export function compareParts(a: Line, b: Line): number {
  const ca = isCommercialNumber(a.number) ? 1 : 0;
  const cb = isCommercialNumber(b.number) ? 1 : 0;
  if (ca !== cb) return ca - cb;
  const na = Number(a.number);
  const nb = Number(b.number);
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  return a.name.localeCompare(b.name);
}

const stopKeys = (m: Movement) =>
  new Set(
    m.nextStops.flatMap((s) =>
      [s.arr?.planned, s.dep?.planned].filter(Boolean).map((t) => `${s.stop.id}@${t}`),
    ),
  );

/**
 * radar movements of one train set merged: same position and at least one stop at the same planned
 * time (buses stay apart — several buses of a replacement line often wait at the same stop). Each
 * group is sorted with {@link compareParts}; duplicates of the same train name are dropped.
 */
export function groupMovements(ms: Movement[]): Movement[][] {
  const groups: { pos: string; keys: Set<string>; parts: Movement[] }[] = [];
  const out: Movement[][] = [];
  for (const m of ms) {
    if (m.line.product === "bus") {
      out.push([m]);
      continue;
    }
    const pos = `${m.lat.toFixed(5)},${m.lon.toFixed(5)}`;
    const keys = stopKeys(m);
    const g = groups.find((g) => g.pos === pos && [...keys].some((k) => g.keys.has(k)));
    if (g) {
      if (!g.parts.some((p) => p.line.name === m.line.name)) g.parts.push(m);
      for (const k of keys) g.keys.add(k);
    } else groups.push({ pos, keys, parts: [m] });
  }
  for (const g of groups) out.push(g.parts.sort((a, b) => compareParts(a.line, b.line)));
  return out;
}
