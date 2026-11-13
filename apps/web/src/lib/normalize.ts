// Text normalization for local search (stations, trains).
const REPLACEMENTS: [RegExp, string][] = [
  [/ß/g, "ss"],
  [/æ/g, "ae"],
  [/ø/g, "o"],
];

/** lowercase, strip diacritics, unify punctuation */
export function normalize(s: string): string {
  let out = s.toLowerCase();
  for (const [re, rep] of REPLACEMENTS) out = out.replace(re, rep);
  return out
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[./()\-–,'’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** umlaut-as-digraph variant: "ö" → "oe" (so "moedling" finds "Mödling") */
export function digraphs(s: string): string {
  return s.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue");
}

const SYNONYMS: [RegExp, string][] = [
  [/\bhbf\b/g, "hauptbahnhof"],
  [/\bhauptbahnhof\b/g, "hbf"],
  [/\bbf\b/g, "bahnhof"],
  [/\bbahnhof\b/g, "bf"],
  [/\bst\b/g, "sankt"],
  [/\bsankt\b/g, "st"],
  [/\bwestbf\b/g, "westbahnhof"],
];

/** all normalized search keys for a name: normalized, digraph variant, synonyms */
export function searchKeys(name: string): string[] {
  const base = normalize(name);
  const keys = new Set([base, normalize(digraphs(name))]);
  for (const k of [...keys]) {
    for (const [re, rep] of SYNONYMS) {
      if (re.test(k)) keys.add(k.replace(re, rep));
      re.lastIndex = 0;
    }
  }
  return [...keys];
}

/** true if every query token is a prefix of some key token */
export function tokenPrefixMatch(queryTokens: string[], keyTokens: string[]): boolean {
  return queryTokens.every((q) => keyTokens.some((k) => k.startsWith(q)));
}
