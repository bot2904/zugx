// Train index (packages/trains/data): default file (long-distance + night) loaded first,
// full file (incl. regional + S-Bahn) on demand.
import { LONG_DISTANCE, NIGHT, REGIONAL, SUBURBAN } from "./products.ts";

export interface TrainEntry {
  op: string;
  cat: string;
  nr: string;
  name?: string;
  from: [id: string, time: string];
  to: [id: string, time: string];
  via?: string[];
  /** base64 bitset of running days, bit 0 = timetable begin */
  days: string;
  /** number of running days */
  n: number;
  first: string;
  last: string;
  var?: number;
}

export interface TrainIndex {
  year: number;
  begin: string;
  end: string;
  source: string;
  stations: Record<string, string>;
  trains: TrainEntry[];
}

const files = import.meta.glob<{ default: TrainIndex }>(
  "../../../../packages/trains/data/trains-*.json",
);

/** available years, newest first */
export const years = [
  ...new Set(
    Object.keys(files)
      .map((p) => /trains-(\d{4})/.exec(p)?.[1])
      .filter(Boolean) as string[],
  ),
]
  .map(Number)
  .sort((a, b) => b - a);

const cache = new Map<string, Promise<TrainIndex | undefined>>();

export function loadTrains(year: number, full: boolean): Promise<TrainIndex | undefined> {
  const key = `${year}:${full}`;
  let p = cache.get(key);
  if (!p) {
    const path = Object.keys(files).find((f) =>
      f.endsWith(`trains-${year}${full ? ".full" : ""}.json`),
    );
    const loader = path ? files[path] : undefined;
    p = loader ? loader().then((m) => m.default) : Promise.resolve(undefined);
    cache.set(key, p);
  }
  return p;
}

/** Year whose timetable period contains the given ISO date, else the newest year. */
export function yearFor(isoDate: string): number | undefined {
  // timetable year Y runs from mid-December Y-1 to mid-December Y
  const y = Number(isoDate.slice(0, 4));
  const md = isoDate.slice(5);
  const guess = md >= "12-13" ? y + 1 : y;
  return years.includes(guess) ? guess : years[0];
}

// ---------- running days ----------

const bitsCache = new WeakMap<TrainEntry, Uint8Array>();

function bytes(e: TrainEntry): Uint8Array {
  let b = bitsCache.get(e);
  if (!b) {
    const bin = atob(e.days);
    b = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    bitsCache.set(e, b);
  }
  return b;
}

/** bit i (day i after `begin`); LSB-first within each byte */
export function runsOnDay(e: TrainEntry, i: number): boolean {
  const b = bytes(e)[i >> 3];
  return b !== undefined && ((b >> (i & 7)) & 1) === 1;
}

export const dayIndex = (begin: string, iso: string) =>
  Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${begin}T00:00:00Z`)) / 86_400_000);

export const dayIso = (begin: string, i: number) =>
  new Date(Date.parse(`${begin}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10);

export function totalDays(idx: Pick<TrainIndex, "begin" | "end">): number {
  return dayIndex(idx.begin, idx.end) + 1;
}

/** Short running-days summary: weekday pattern + exception count. */
export function daysSummary(
  e: TrainEntry,
  idx: Pick<TrainIndex, "begin" | "end">,
  t: { weekdays: string[]; daily: string; except: (n: number) => string },
): string {
  const total = totalDays(idx);
  if (e.n >= total) return t.daily;
  const perWd = Array<number>(7).fill(0);
  const possible = Array<number>(7).fill(0);
  const beginWd = (new Date(`${idx.begin}T00:00:00Z`).getUTCDay() + 6) % 7; // Mo = 0
  for (let i = 0; i < total; i++) {
    const wd = (beginWd + i) % 7;
    possible[wd]!++;
    if (runsOnDay(e, i)) perWd[wd]!++;
  }
  // a weekday "counts" if the train runs on most of its occurrences
  const on = perWd.map((c, i) => c >= possible[i]! * 0.5 && c > 0);
  const missing = on.reduce((acc, o, i) => acc + (o ? possible[i]! - perWd[i]! : 0), 0);
  const label = weekdayRanges(on, t.weekdays);
  if (!label) return `${e.n}×`;
  const base = on.every(Boolean) ? t.daily : label;
  return missing > 0 ? `${base} ${t.except(missing)}` : base;
}

function weekdayRanges(on: boolean[], names: string[]): string {
  const parts: string[] = [];
  let i = 0;
  while (i < 7) {
    if (!on[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < 7 && on[j + 1]) j++;
    parts.push(
      j - i >= 2 ? `${names[i]}–${names[j]}` : j > i ? `${names[i]}, ${names[j]}` : names[i]!,
    );
    i = j + 1;
  }
  return parts.join(", ");
}

// ---------- groups ----------

export type QuickFilter = "all" | "long" | "regional" | "suburban" | "night";

export function inGroup(cat: string, g: QuickFilter): boolean {
  switch (g) {
    case "all":
      return true;
    case "long":
      return LONG_DISTANCE.has(cat) || (!REGIONAL.has(cat) && !SUBURBAN.has(cat));
    case "regional":
      return REGIONAL.has(cat);
    case "suburban":
      return SUBURBAN.has(cat);
    case "night":
      return NIGHT.has(cat);
  }
}

/** groups that need the full file (default file has no regional/S-Bahn trains) */
export const needsFull = (g: QuickFilter) => g === "all" || g === "regional" || g === "suburban";

export const CATEGORY_ORDER = [
  "RJX",
  "RJ",
  "ICE",
  "EC",
  "IC",
  "NJ",
  "EN",
  "D",
  "WB",
  "CJX",
  "REX",
  "R",
  "S",
];
export const catRank = (c: string) => {
  const i = CATEGORY_ORDER.indexOf(c);
  return i < 0 ? 50 : i;
};
