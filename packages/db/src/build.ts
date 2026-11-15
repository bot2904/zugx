// Build the country's SQLite (COUNTRY, default at → .cache/zugx.sqlite): import its GTFS feeds
// (country.ts; GTFS_ZIP overrides) with node-gtfs into its standard tables, then run the country's
// SQL fix-ups. Skipped: shapes (≈ 95 % of the ÖBB feed; not needed for the
// exports yet), pathways and levels (station walkways; the ÖBB pathways fail node-gtfs's checks,
// traversal_time 0). Run: vp run db:build
import { rmSync } from "node:fs";
import { importGtfs } from "gtfs";
import { currentCountry, fetchFeeds, timer } from "@zugx/gtfs";
import { DB_PATH } from "./index.ts";
import { openZugxDb } from "./query.ts";

async function main() {
  const t = timer();
  const feeds = await fetchFeeds();
  rmSync(DB_PATH, { force: true });
  await importGtfs({
    sqlitePath: DB_PATH,
    agencies: feeds.map((f) => ({ path: f.path, exclude: ["shapes", "pathways", "levels"] })),
    ignoreDuplicates: false,
    verbose: true,
  });
  const country = currentCountry();
  if (country.fixups?.length) {
    const db = openZugxDb(DB_PATH);
    for (const sql of country.fixups) {
      const r = db.prepare(sql).run();
      console.log(`db: fix-up: ${r.changes} rows — ${sql.replace(/\s+/g, " ").slice(0, 80)}…`);
    }
  }
  console.log(`db: ${country.id}: ${feeds.length} feed(s) → ${DB_PATH} (${t()})`);
}

if (import.meta.main) await main();
