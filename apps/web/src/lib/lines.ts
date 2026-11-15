// Regional line per train from the timetable ("S 4017" → "S 1"), for the GTFS-based views, which
// only know category and train number (packages/trains/data/lines-<year>.toml, loaded on first use).
import { shallowRef } from "vue";

const files = import.meta.glob<{ default: Record<string, string> }>(
  "../../../../packages/trains/data/lines-*.toml",
);
const map = shallowRef<Record<string, string>>();
let loading: Promise<void> | undefined;
/** categories with lines */
const LINE_CATS = new Set(["S", "R", "REX", "CJX"]);

function load() {
  loading ??= (async () => {
    const newest = Object.keys(files).sort().at(-1);
    if (newest) map.value = (await files[newest]!()).default;
  })();
  return loading;
}

/** the line of a regional train ("S", "4017" → "S 1"), undefined if unknown (or still loading) */
export function lineFor(cat: string, nr: string): string | undefined {
  if (!LINE_CATS.has(cat.toUpperCase())) return undefined;
  if (!map.value) {
    void load();
    return undefined;
  }
  return map.value[`${cat.toUpperCase()} ${nr}`];
}
