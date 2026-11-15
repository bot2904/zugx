// Shared read helpers on the local SQLite (node-gtfs schema) for the data exports.
import { existsSync } from "node:fs";
import { openDb } from "gtfs";
import { DB_PATH } from "./index.ts";

export type Db = ReturnType<typeof openDb>;

/** open .cache/zugx.sqlite (read-only use); fails with a hint if it hasn't been built */
export function openZugxDb(path = DB_PATH): Db {
  if (!existsSync(path)) throw new Error(`${path} missing — run \`vp run db:build\` first`);
  return openDb({ sqlitePath: path });
}

/** all rows of a query */
export const rows = <T>(db: Db, sql: string, ...params: unknown[]): T[] =>
  db.prepare(sql).all(...params) as T[];

/** GTFS rail route types: 2 and the extended rail types 100–117 */
export const RAIL_ROUTE_TYPES = "(r.route_type = 2 or r.route_type between 100 and 117)";

/** days since 1970-01-01 of a GTFS date (yyyymmdd as number or string) */
export function dayNumber(yyyymmdd: number | string): number {
  const s = String(yyyymmdd);
  return Math.round(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)) / 86_400_000);
}

/**
 * service id → sorted active days (days since 1970-01-01): calendar ranges with their weekdays,
 * then calendar_dates added/removed — as @zugx/gtfs loadGtfs
 */
export function serviceDays(db: Db): Map<string, number[]> {
  const cal = new Map<string, Set<number>>();
  type C = Record<"service_id" | "start_date" | "end_date", string> & Record<string, number>;
  const WD = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  for (const c of rows<C>(db, "select * from calendar")) {
    const days = cal.get(c.service_id) ?? new Set<number>();
    cal.set(c.service_id, days);
    const end = dayNumber(c.end_date);
    // day 0 (1970-01-01) was a Thursday
    for (let d = dayNumber(c.start_date); d <= end; d++) if (c[WD[(d + 4) % 7]!] === 1) days.add(d);
  }
  for (const x of rows<{ service_id: string; date: string; exception_type: number }>(
    db,
    "select service_id, date, exception_type from calendar_dates",
  )) {
    let days = cal.get(x.service_id);
    if (!days) cal.set(x.service_id, (days = new Set()));
    if (x.exception_type === 1) days.add(dayNumber(x.date));
    else days.delete(dayNumber(x.date));
  }
  return new Map([...cal].map(([id, d]) => [id, [...d].sort((a, b) => a - b)]));
}
