import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
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

/**
 * Write `{...head, [key]: [\n item,\n item\n]}` with one item per line, so git diffs show
 * exactly which entries changed.
 */
export async function writeJsonLines(
  path: string,
  head: Record<string, unknown>,
  key: string,
  items: unknown[],
  tail: Record<string, unknown> = {},
): Promise<string> {
  const headJson = JSON.stringify(head).slice(0, -1);
  const tailJson = Object.entries(tail)
    .map(([k, v]) => `,\n${JSON.stringify(k)}:${JSON.stringify(v)}`)
    .join("");
  const body = items.map((x) => JSON.stringify(x)).join(",\n");
  const text = `${headJson}${headJson.length > 1 ? "," : ""}${JSON.stringify(key)}:[\n${body}\n]${tailJson}}\n`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
  return text;
}

/** Write a JSON array with one item per line. */
export async function writeJsonArray(path: string, items: unknown[]): Promise<string> {
  const text = `[\n${items.map((x) => JSON.stringify(x)).join(",\n")}\n]\n`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
  return text;
}

/** Write an object with one key per line (sorted). */
export async function writeJsonMap(path: string, map: Record<string, unknown>): Promise<string> {
  const keys = Object.keys(map).sort();
  const text = `{\n${keys.map((k) => `${JSON.stringify(k)}:${JSON.stringify(map[k])}`).join(",\n")}\n}\n`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
  return text;
}

export function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8")) as T;
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
