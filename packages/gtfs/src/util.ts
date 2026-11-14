import type { Gtfs } from "./gtfs.ts";

/** Station group of a GTFS stop: its parent station, or the stop itself. */
export function stationGroup(g: Gtfs, stopId: string): string {
  const s = g.stops.get(stopId);
  return s?.parent || stopId;
}

/** The n-th weekday (ISO: 1 = Monday … 7 = Sunday) in a month. */
function nthWeekday(year: number, month: number, weekday: number, n: number): Temporal.PlainDate {
  const first = Temporal.PlainDate.from({ year, month, day: 1 });
  return first.add({ days: ((weekday - first.dayOfWeek + 7) % 7) + (n - 1) * 7 });
}

/**
 * European timetable year: starts on the second Sunday of December of the previous year and
 * ends the day before the second Sunday of December, e.g. 2026 = 2025-12-14 … 2026-12-12.
 */
export function timetableYear(year: number): { begin: string; end: string; days: number } {
  const begin = nthWeekday(year - 1, 12, 7, 2);
  const nextBegin = nthWeekday(year, 12, 7, 2);
  return {
    begin: begin.toString(),
    end: nextBegin.subtract({ days: 1 }).toString(),
    days: begin.until(nextBegin).days,
  };
}

/** Run `fn` over `items` with at most `n` running at once (results in input order). */
export async function mapPool<T, R>(
  items: readonly T[],
  n: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = Array.from({ length: items.length });
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k]!, k);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

export function timer() {
  const t0 = Date.now();
  return () => `${((Date.now() - t0) / 1000).toFixed(1)} s`;
}
