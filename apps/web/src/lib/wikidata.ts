// Links to DinoData (https://dinodata.toolforge.org), a Wikidata viewer. Items are not hard-coded:
// stations are opened by their IBNR (Wikidata P954 = our HAFAS id), railway lines by the item the
// build resolved from Wikidata (station P954 → connecting line P81).
export const DINODATA = "https://dinodata.toolforge.org/";

/** DinoData: the station with this IBNR (P954), e.g. 8100002 → Salzburg Hbf */
export const stationWikidata = (hafasId: string) =>
  `${DINODATA}#P954=${encodeURIComponent(hafasId)}`;

/** DinoData: a Wikidata item, e.g. Q259313 (Semmeringbahn) */
export const itemWikidata = (qid: string) => `${DINODATA}#${qid}`;
