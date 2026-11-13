# Bildfahrplan (time–distance diagram)

`/bf` (index), `/bf/<corridor>?from=<hour>&h=<hours>`

## Data

Built by `vp run netz:build` from the **ÖBB GTFS** of the whole timetable year. Corridors are defined in `packages/netz/src/corridors.ts` by ordered anchor stations: **all ÖBB [Fahrplanbilder](https://www.oebb.at/de/fahrplan/fahrplanbilder)** that are trains in the ÖBB GTFS (61 of 83; private railways such as Mariazellerbahn, Pinzgaubahn, Zillertalbahn, StH/StB lines, cog and cable railways are not in the data), each under its ÖBB number (`/bf/101`), plus a few zugx corridors spanning several Fahrplanbilder (Westbahn, Südbahn, Koralmbahn, Giselabahn, Rheintal, S-Bahn trunk line). Old zugx corridor ids redirect to their Fahrplanbild (`/bf/brenner` → `/bf/300`); the build adds every station served between two anchors (station list taken from a reference day, Tuesday 2026-03-10), places stations by track distance (GTFS `shape_dist_traveled`, haversine fallback), and collects every train of the year that stops at ≥ 2 corridor stations, with its arrival/departure minutes per station. Runs with identical times on different days are stored once with a **running-days bitset** (same encoding as the train index), so any date of the timetable period can be shown. Details: [packages/netz/README.md](../packages/netz/README.md).

Limits: planned timetable (December snapshot), no realtime; dates outside the timetable period show no trains; ÖBB GTFS only (no WESTbahn/GKB/GySEV trains); trains passing a station without stopping have no time there (lines connect the stops).

## How it is shown

- **Index** (`/bf`): all corridors (sorted by ÖBB Fahrplanbild number, searchable by number) with main stations, length, stations, trains/day (on the reference Tuesday) and the mix of train categories; filter by corridor or station name, sortable.
- **Diagram**: x = km along the corridor (major stations bold), y = time downwards. Each train is a polyline through its stops (vertical segments = dwell time), coloured by category; steeper = slower. Regional/S-Bahn lines are thinner.
- **Section and direction**: pick the first and last station (`?a=`, `?b=` station ids) to show only part of the route; ⇄ swaps the direction (`?rev=1`, the diagram is mirrored); "Whole route" resets.
- **Date** (`?d=YYYY-MM-DD`, default today): date picker, ‹ › for previous/next day; only trains running on that date are drawn, with the train count.
- Window: scroll (mouse wheel / trackpad) over the diagram to move in time (10 % of the window per notch), Ctrl/⌘ + scroll or pinch to zoom (1–24 h), Shift + scroll stays horizontal; or use start hour ▲▼ and 2/4/8/24 h; the dashed red line is the current time (only when today is shown). Category chips hide/show categories.
- Hover highlights a train (number and destination below the chart); click opens its live train run on the selected date.
