/**
 * Coupled train parts (Zugteile): night trains and Railjets often run as several commercial
 * trains joined into one (EN 40462 = EC 462 Budapest–Salzburg, then NJ 466 Salzburg–Zürich).
 * HAFAS returns one radar movement per commercial part, all at the same position; JourneyDetails
 * names the joined trains and their sections (`parJnySegL`, see parse.ts → `Trip.parts`).
 */
import type { Line, Movement, Trip, TripPart } from "./types.ts";

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

/** one stretch of a run with the same joined trains */
export interface PartSection {
  /** stop indices in the trip's stopovers */
  from: number;
  to: number;
  /** joined trains on this stretch, likely operational first */
  with: TripPart[];
  /**
   * the operational train, where it can be told: for a commercial-only train the joined train with
   * a regular number, else the operational number HAFAS hints at (`matchId`, e.g. EN 415, which is
   * not in the timetable as a train of its own)
   */
  operational?: { line: Line; journeyId?: string; hint?: boolean };
}

/**
 * the run split into stretches with the same joined trains (stretches without any are left out,
 * unless HAFAS names an operational number there)
 */
export function partSections(trip: Trip): PartSection[] {
  const parts = trip.parts ?? [];
  const n = trip.stopovers.length;
  if (n < 2 || (!parts.length && !trip.stopNumbers)) return [];
  const commercial = isCommercialNumber(trip.line.number);
  const segs: { with: TripPart[]; op?: PartSection["operational"] }[] = [];
  for (let i = 0; i + 1 < n; i++) {
    const w = parts
      .filter((p) => p.from <= i && p.to >= i + 1)
      .sort((a, b) => compareParts(a.line, b.line));
    let op: PartSection["operational"];
    const regular = w.find((p) => !isCommercialNumber(p.line.number));
    if (commercial && regular) op = { line: regular.line, journeyId: regular.journeyId };
    else if (commercial) {
      const nr = trip.stopNumbers?.[i];
      if (nr && nr !== trip.line.number && !isCommercialNumber(nr))
        op = {
          line: { ...trip.line, name: `${trip.line.category} ${nr}`, number: nr },
          hint: true,
        };
    }
    segs.push({ with: w, op });
  }
  const sig = (s: (typeof segs)[number]) =>
    `${s.with.map((p) => p.journeyId).join(",")}|${s.op?.line.name ?? ""}`;
  const out: PartSection[] = [];
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]!;
    const last = out.at(-1);
    if (last && last.to === i && sig(segs[i - 1]!) === sig(s)) last.to = i + 1;
    else
      out.push({
        from: i,
        to: i + 1,
        with: s.with,
        ...(s.op ? { operational: s.op } : {}),
      });
  }
  return out.filter((s) => s.with.length || s.operational);
}

/**
 * stops where the operational train changes (index → the new one), for a note in the stop list —
 * only for commercial-only trains, from the second stretch on
 */
export function operationalChanges(
  sections: PartSection[],
): Map<number, PartSection["operational"]> {
  const m = new Map<number, PartSection["operational"]>();
  let prev: string | undefined;
  for (const s of sections) {
    const name = s.operational?.line.name;
    if (name && prev !== undefined && name !== prev) m.set(s.from, s.operational);
    if (name) prev = name;
  }
  return m;
}
