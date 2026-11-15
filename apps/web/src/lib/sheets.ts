// Bildfahrplan sheet numbers: the ÖBB Fahrplanbild number ("101", "100/101"), else — sheets of the
// other countries, ids "<country>-<line>" — the national line number ("si-10" → "10",
// "hr-m101" → "M101", "bg-1a" → "1A").
import type { CorridorIndexEntry } from "@zugx/netz";

export const sheetNumber = (c: Pick<CorridorIndexEntry, "id" | "oebb">): string | undefined =>
  c.oebb ?? /^[a-z]{2}-([a-z]?\d+[a-z]?(?:-\d)?)$/.exec(c.id)?.[1]?.toUpperCase();

/** book order of sheet numbers: alphabetical, numbers by value ("2" < "10", "L101" < "M101") */
export const compareSheetNumbers = (a: string, b: string): number =>
  a.localeCompare(b, "en", { numeric: true });

/** a sheet number's section in the book: hundreds (1xx), tens for two digits, else its letter (M, R) */
export function sheetGroup(nr: string): string {
  if (/^\d{3,}$/.test(nr)) return `${nr[0]}00`;
  if (/^\d+$/.test(nr)) return `${nr[0]}0`;
  return nr[0] ?? "";
}
