// VzG data files of all countries (packages/vzg/data, data/<country>; from OSM, ODbL) and the
// traffic density of the netz build: the index, network, geometry and boundaries per country,
// the line files by their id (unique across the countries: "101-01", "10").
import { countryOfPath, ofCountry } from "./country.ts";

const FILES = import.meta.glob<{ default: unknown }>("../../../../packages/vzg/data/**/*.toml");
const DENSITY = import.meta.glob<{ default: unknown }>(
  "../../../../packages/netz/data/**/density.toml",
);

const fileOf = (files: Record<string, () => Promise<{ default: unknown }>>, name: string) =>
  Object.entries(files).find(([p]) => p.endsWith(`/${name}.toml`));

/** a country's file ("index", "network", "geometry", "boundaries") */
export async function vzgFile<T>(name: string, c: string): Promise<T | undefined> {
  const f = fileOf(ofCountry(FILES, c), name)?.[1];
  return f ? ((await f()).default as T) : undefined;
}

/** the country of a line (by its id), undefined if there's no such line */
export function lineCountry(id: string): string | undefined {
  const f = fileOf(FILES, id);
  return f ? countryOfPath(f[0]) : undefined;
}

/** a line's file, from whichever country has it */
export async function vzgLine<T>(id: string): Promise<T | undefined> {
  const f = fileOf(FILES, id)?.[1];
  return f ? ((await f()).default as T) : undefined;
}

/** trains per day on each km of a country's lines (netz build, reference day) */
export async function densityOf<T>(c: string): Promise<T | undefined> {
  const f = Object.values(ofCountry(DENSITY, c))[0];
  return f ? ((await f()).default as T) : undefined;
}
