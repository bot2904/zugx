// Bildfahrplan sheet numbers: the ÖBB Fahrplanbild number ("101", "100/101"), else — sheets of the
// other countries, ids "<country>-<line>" — the national line number ("si-10" → "10").
import type { CorridorIndexEntry } from "@zugx/netz";

export const sheetNumber = (c: Pick<CorridorIndexEntry, "id" | "oebb">): string | undefined =>
  c.oebb ?? /^[a-z]{2}-(\d+)$/.exec(c.id)?.[1];
