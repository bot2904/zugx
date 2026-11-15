// Build .cache/zugx.sqlite: import the configured GTFS feeds (GTFS_ZIP, default: ÖBB) with
// node-gtfs into its standard tables. Skipped: shapes (≈ 95 % of the ÖBB feed; not needed for the
// exports yet), pathways and levels (station walkways; the ÖBB pathways fail node-gtfs's checks,
// traversal_time 0). Run: vp run db:build
import { rmSync } from "node:fs";
import { importGtfs } from "gtfs";
import { fetchFeeds, timer } from "@zugx/gtfs";
import { DB_PATH } from "./index.ts";

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
  console.log(`db: ${feeds.length} feed(s) → ${DB_PATH} (${t()})`);
}

if (import.meta.main) await main();
