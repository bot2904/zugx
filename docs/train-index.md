# Train index (Zugindex)

`/trains`, `/trains/<operator>/<category>` — query: `q` (search), `g` (quick filter), `d` (runs on date), `at` (station), `y` (timetable year).

## Data

Built by `vp run trains:build` from the **ÖBB GTFS** of the timetable year (2026: 14 Dec 2025 – 12 Dec 2026):

1. A **train** = operator + category + number from `trip_short_name` ("RJX 260"). Rail only, at least one stop in Austria. GTFS splits trains at borders; segments of the same train on the same day are chained.
2. **Main route** = the most frequent stop sequence over the year; `var` counts the different sequences ("route variants"). `from`/`to` with times (+1 = after midnight), `via` = up to 6 hubs for display, `stops` = all intermediate stops (for search and the station filter).
3. **Running days** = union of the GTFS calendars as a bitset over the timetable year (bit 0 = first day, MSB first, like HAFAS).
4. **Names** ("Transalpin", "Dacia"): not in the GTFS. For long-distance trains zugx asks HAFAS `JourneyMatch` once per train and reads the remark with code `ZN`; cached in `names-<year>.json`.
5. Two files: `trains-<year>.json` (default, long-distance + night: RJX, RJ, ICE, EC, IC, EN, NJ, D, IR, …) and `trains-<year>.full.json` (all, incl. CJX, REX, R, S). Station names for all referenced ids are embedded.

Limits: ÖBB GTFS only (no WESTbahn); it is the December snapshot, so changes during the year are missing; foreign termini can be cut at the end of ÖBB's part of the run.

## How it is shown

- The default file loads first (~20 KB gzip); the full file (~150 KB) loads when choosing Regional/S-Bahn/All, a regional category, a station filter, or "+ Regional/S-Bahn".
- **Search** matches category + number (`rjx 2`, `260`), names, and all stations on the main route.
- **Running days** column: weekday pattern within the train's own period (first – last running day), e.g. `Mo–Fr`, `daily −23` (23 days it doesn't run despite the pattern), `+n` extra days; `n×` if there is no clear pattern. The tooltip lists the exact dates.
- **Year strip**: one column per week (Mon top, Sun bottom), green = runs, ticks = first of each month; hover shows the date.
- The train badge links to the live train run on the next running day.
