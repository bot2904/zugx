/**
 * Railway lines of a Bildfahrplan sheet, resolved from Wikidata properties (CC0) at build time:
 * station (P954 IBNR = our HAFAS id) → connecting line (P81), with the line's route number
 * (P1671, ÖBB infrastructure number such as "105 01") where present. Nothing is hard-coded.
 */

export interface WikidataLine {
  /** Wikidata item, e.g. "Q259313" */
  qid: string;
  name: string;
  /** P1671 route number(s), e.g. "105 01" */
  number?: string;
  /** stations of the sheet on this line */
  stations: number;
}

const SPARQL = "https://query.wikidata.org/sparql";
const USER_AGENT = "zugx (https://zugx.legner.me)";

/** connecting lines (P81) of stations by IBNR (P954): IBNR → lines */
export async function linesByIbnr(
  ibnrs: string[],
): Promise<Map<string, { qid: string; name: string; number?: string }[]>> {
  const out = new Map<string, { qid: string; name: string; number?: string }[]>();
  const CHUNK = 300;
  for (let i = 0; i < ibnrs.length; i += CHUNK) {
    const values = ibnrs
      .slice(i, i + CHUNK)
      .map((v) => JSON.stringify(v))
      .join(" ");
    const query = `SELECT ?ibnr ?line ?lineLabel (GROUP_CONCAT(DISTINCT ?num; separator=", ") AS ?nums) WHERE {
  VALUES ?ibnr { ${values} }
  ?station wdt:P954 ?ibnr ; wdt:P81 ?line .
  OPTIONAL { ?line wdt:P1671 ?num }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "de,en". }
} GROUP BY ?ibnr ?line ?lineLabel`;
    const res = await fetch(`${SPARQL}?query=${encodeURIComponent(query)}`, {
      headers: { Accept: "application/sparql-results+json", "User-Agent": USER_AGENT },
    });
    if (!res.ok) throw new Error(`Wikidata query: ${res.status} ${res.statusText}`);
    const json = (await res.json()) as {
      results: { bindings: Record<string, { value: string }>[] };
    };
    for (const b of json.results.bindings) {
      const qid = b.line!.value.split("/").pop()!;
      const l = out.get(b.ibnr!.value) ?? [];
      l.push({ qid, name: b.lineLabel!.value, ...(b.nums?.value ? { number: b.nums.value } : {}) });
      out.set(b.ibnr!.value, l);
    }
  }
  return out;
}

/**
 * Lines of a sheet: connecting at least 3 of its stations, or at least 30 % (short sheets) —
 * lines touching only 2 stations are mostly junctions (e.g. Vorortelinie at Penzing/Hütteldorf).
 * Most stations first, max. `limit`.
 */
export function sheetLines(
  stationIbnrs: string[],
  lines: Map<string, { qid: string; name: string; number?: string }[]>,
  { limit = 6 } = {},
): WikidataLine[] {
  const n = new Set(stationIbnrs).size;
  const count = new Map<string, WikidataLine>();
  for (const ibnr of new Set(stationIbnrs))
    for (const l of lines.get(ibnr) ?? []) {
      const c = count.get(l.qid) ?? { ...l, stations: 0 };
      c.stations++;
      count.set(l.qid, c);
    }
  return [...count.values()]
    .filter((l) => l.stations >= 2 && (l.stations >= 3 || l.stations >= 0.3 * n))
    .sort((a, b) => b.stations - a.stations || a.name.localeCompare(b.name))
    .slice(0, limit);
}
