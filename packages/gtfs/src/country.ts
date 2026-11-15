// The countries zugx builds data for (packages/gtfs/countries.toml) and the paths per country.
// Every data script works on one country, chosen with the environment variable COUNTRY (default
// "at", which keeps the original paths, so the Austrian data stays byte-identical).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fromToml } from "@zugx/toml";
import { CACHE_DIR, REPO_ROOT } from "./feed.ts";

export interface Country {
  id: string;
  /** name in German and English (UI, data headers) */
  name: { de: string; en: string };
  /** UIC country code: station ids (HAFAS/UIC) of this country start with it, e.g. "81" */
  uic: string;
  timezone: string;
  /** GTFS feeds (URLs or paths), merged; overridable with GTFS_ZIP */
  feeds: string[];
  /** Geofabrik extract name; the newest `.cache/<osm>-YYMMDD.osm.pbf` is used */
  osm: string;
  /** licence of the timetable data, for the data files and the attribution */
  licence: { name: string; url: string; source: string };
  /** SQL run on the country's database after the import (feed quirks → the expected shape) */
  fixups?: string[];
}

export const COUNTRIES: Record<string, Country> = Object.fromEntries(
  Object.entries(
    fromToml<Record<string, Omit<Country, "id">>>(
      readFileSync(join(import.meta.dirname, "..", "countries.toml"), "utf8"),
    ),
  ).map(([id, c]) => [id, { id, ...c }]),
);

/** the country of this run (COUNTRY, default "at") */
export function currentCountry(env = process.env): Country {
  const id = (env.COUNTRY ?? "at").toLowerCase();
  const c = COUNTRIES[id];
  if (!c) throw new Error(`unknown COUNTRY "${id}" (known: ${Object.keys(COUNTRIES).join(", ")})`);
  return c;
}

/**
 * a package's data directory for a country: `packages/<pkg>/data` for Austria (the original
 * layout), `packages/<pkg>/data/<country>` for the others
 */
export function dataDir(pkg: string, c: Country = currentCountry()): string {
  const base = join(REPO_ROOT, "packages", pkg, "data");
  return c.id === "at" ? base : join(base, c.id);
}

/** the country's local SQLite (.cache/zugx.sqlite for Austria, .cache/zugx-<id>.sqlite else) */
export function dbPath(c: Country = currentCountry()): string {
  return join(CACHE_DIR, c.id === "at" ? "zugx.sqlite" : `zugx-${c.id}.sqlite`);
}
