// Train categories (Zuggattungen) as found in trip_short_name / HAFAS. Pure module, safe for the browser.

/** Display/sort order, long-distance → regional. Unknown categories sort after these. */
export const CATEGORY_ORDER = [
  "RJX",
  "RJ",
  "ICE",
  "ECE",
  "TGV",
  "FR",
  "EC",
  "IC",
  "EN",
  "NJ",
  "ES",
  "IR",
  "D",
  "WB",
  "CAT",
  "ATB",
  "SP",
  "ER",
  "CJX",
  "REX",
  "RE",
  "RB",
  "RR",
  "OS",
  "R",
  "S",
] as const;

/** Long-distance + night categories: the default train index (everything else is in the full one). */
export const LONG_DISTANCE_CATEGORIES: readonly string[] = [
  "RJX",
  "RJ",
  "ICE",
  "ECE",
  "TGV",
  "FR",
  "EC",
  "IC",
  "EN",
  "NJ",
  "ES",
  "IR",
  "D",
  "WB",
];

export const NIGHT_CATEGORIES: readonly string[] = ["NJ", "EN"];

const rank = new Map<string, number>(CATEGORY_ORDER.map((c, i) => [c, i]));

export function categoryRank(cat: string): number {
  return rank.get(cat) ?? CATEGORY_ORDER.length;
}

/** Sort categories long-distance → regional, unknown ones alphabetically at the end. */
export function compareCategories(a: string, b: string): number {
  return categoryRank(a) - categoryRank(b) || (a < b ? -1 : a > b ? 1 : 0);
}

/** "RJX 260" → { cat: "RJX", nr: "260" }; undefined if it doesn't look like a train name. */
export function parseTrainName(s: string): { cat: string; nr: string } | undefined {
  const m = /^\s*([A-Za-zÄÖÜäöü]{1,5})\s*(\d{1,6}[A-Za-z]?)\s*$/.exec(s);
  if (!m) return undefined;
  return { cat: m[1]!.toUpperCase(), nr: m[2]! };
}
