// Local SQLite of all data inputs, one per country (.cache/zugx.sqlite for Austria,
// .cache/zugx-<country>.sqlite else; COUNTRY selects): GTFS tables in node-gtfs's standard schema
// (agency, stops, routes, trips, stop_times, calendar, calendar_dates …). The source for the
// static data exports (packages/*/data/…); not committed, not in the app.
import { dbPath } from "@zugx/gtfs/country";

export const DB_PATH = dbPath();
