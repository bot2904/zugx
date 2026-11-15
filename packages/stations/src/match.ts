// Matching GTFS stations to HAFAS stations: name normalization, similarity, candidate scoring.
import { RAIL_PRODUCTS, type Location } from "@zugx/hafas";

/**
 * Normalize a station name for comparison: case, diacritics, Hbf/Hauptbahnhof, St./Sankt and
 * " Bahnhof"-style suffixes. With `expand`, also abbreviations like "Wr." → "Wiener" (for matching;
 * the client search doesn't know those, so aliases are deduplicated without it).
 */
export function normalizeName(s: string, expand = false): string {
  let n = s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/hauptbahnhof/g, " hbf ")
    .replace(/\bsankt\b/g, "st")
    .replace(/\bst\./g, "st ");
  if (expand) n = n.replace(/\bwr\.\s*/g, "wiener ").replace(/\bbf\.?$/g, "");
  return n
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(bahnhof|bahnhst|bhf|bf|haltestelle|hst|station|bahnsteige?)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const tokens = (s: string) => normalizeName(s, true).split(" ").filter(Boolean);

/** Token Dice similarity (0…1); tokens match if equal or one is a prefix (≥ 3 chars) of the other. */
export function nameSimilarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) return 0;
  const used = new Set<number>();
  let hits = 0;
  for (const x of ta) {
    const j = tb.findIndex(
      (y, i) =>
        !used.has(i) &&
        (x === y ||
          (x.length >= 3 && y.startsWith(x)) ||
          (y.length >= 3 && x.startsWith(y)) ||
          (/^\d+$/.test(x) && x === y)),
    );
    if (j >= 0) {
      used.add(j);
      hits++;
    }
  }
  return (2 * hits) / (ta.length + tb.length);
}

/** UIC country codes of HAFAS station ids by DHID country prefix. */
export const UIC_COUNTRY: Record<string, string> = {
  at: "81",
  de: "80",
  ch: "85",
  it: "83",
  hu: "55",
  cz: "54",
  sk: "56",
  si: "79",
  hr: "78",
  pl: "51",
  ro: "53",
  ua: "22",
  be: "88",
  nl: "84",
  fr: "87",
  fl: "81",
};

/** Country prefix of a DHID ("at:41:3087:0:1", "Pat:41:3087" → "at"). */
export function dhidCountry(id: string): string {
  const m = /^P?([a-z]{2}):/.exec(id);
  return m?.[1] ?? "";
}

/** Strip HAFAS name suffixes we don't want to show, e.g. "Wien Hbf (Bahnsteige 3-12)" → "Wien Hbf". */
export function cleanHafasName(name: string): string {
  return name
    .replace(/\s*\((Bahnsteig|Bahnsteige|Bstg\.?|Gleis|Gleise)\s[^)]*\)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The HAFAS name with its diacritics restored from a GTFS name that only differs by them (ÖBB
 * HAFAS writes foreign names without: "Divaca" → "Divača"); else the HAFAS name.
 */
export function withDiacritics(hafas: string, gtfsNames: Iterable<string>): string {
  const plain = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (plain(hafas) !== hafas) return hafas;
  for (const g of gtfsNames) {
    const c = cleanGtfsName(g);
    if (c !== hafas && plain(c) === hafas) return c;
  }
  return hafas;
}

/** Remove GTFS name suffixes like " Bahnhof" that HAFAS names don't carry. */
export function cleanGtfsName(name: string): string {
  return name
    .replace(/\s+(Bahnhof|Bahnhst|Haltestelle|Bf|Bhf)$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

const popcount = (n: number) => {
  let c = 0;
  for (let x = n; x; x &= x - 1) c++;
  return c;
};

export interface Scored {
  loc: Location;
  dist: number;
  sim: number;
  score: number;
}

/** rail product classes without 2 (night), which some HAFAS bus stops carry */
const RAIL_DAY = RAIL_PRODUCTS & ~2;

export const servesRail = (l: Location) =>
  l.type === "station" && ((l.products ?? 0) & RAIL_DAY) !== 0;

/** UIC-style station id (country code + 5 digits); HAFAS also has local transit meta stops like 1290401. */
export const isUicId = (id: string) => /^[2578]\d{6}$/.test(id);

export function distanceMetres(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const r = 6_371_000;
  const toRad = Math.PI / 180;
  const dLat = (bLat - aLat) * toRad;
  const dLon = (bLon - aLon) * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * toRad) * Math.cos(bLat * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

/**
 * Score HAFAS candidates for a GTFS station (lower is better): distance in metres, plus penalties for
 * dissimilar names and non-UIC ids (local transit meta stops), minus a bonus for rail product classes.
 */
export function scoreCandidates(
  gtfs: { id: string; name: string; lat: number; lon: number },
  cands: Location[],
): Scored[] {
  const uic = UIC_COUNTRY[dhidCountry(gtfs.id)];
  const seen = new Set<string>();
  const out: Scored[] = [];
  for (const loc of cands) {
    if (seen.has(loc.id) || loc.lat === undefined || loc.lon === undefined) continue;
    const dist = distanceMetres(gtfs.lat, gtfs.lon, loc.lat, loc.lon);
    const sim = Math.max(
      nameSimilarity(gtfs.name, loc.name),
      nameSimilarity(cleanGtfsName(gtfs.name), cleanHafasName(loc.name)),
    );
    // HAFAS product classes are sometimes incomplete (e.g. Wien Quartier Belvedere: tram + bus only),
    // so a station of the expected country with (nearly) the same name is fine, too
    const sameName = sim >= 0.9 && !!uic && loc.id.startsWith(uic) && loc.type === "station";
    if (!servesRail(loc) && !sameName) continue;
    seen.add(loc.id);
    let score = dist + (1 - sim) * 400 - popcount((loc.products ?? 0) & RAIL_PRODUCTS) * 25;
    // prefer UIC ids; some (new) S-Bahn stations only exist as local transit stops (e.g. 1232406)
    if (!isUicId(loc.id)) score += 2000;
    else if (uic && loc.id.startsWith(uic)) score += 0;
    else if (/^[578]/.test(loc.id)) score += 150;
    else score += 1000;
    out.push({ loc, dist, sim, score });
  }
  return out.sort((a, b) => a.score - b.score);
}
