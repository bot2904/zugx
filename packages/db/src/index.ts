// Local SQLite of all data inputs (.cache/zugx.sqlite): GTFS tables in node-gtfs's standard schema
// (agency, stops, routes, trips, stop_times, calendar, calendar_dates …), one import per feed.
// The source for the static data exports (packages/*/data/*.toml); not committed, not in the app.
import { join } from "node:path";

export const DB_PATH = join(import.meta.dirname, "..", "..", "..", ".cache", "zugx.sqlite");
