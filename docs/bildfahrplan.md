# Bildfahrplan (time–distance diagram)

`/bf` (index), `/bf/<corridor>?from=<hour>&h=<hours>`

## Data

Built by `vp run netz:build` from the **ÖBB GTFS** of the whole timetable year. Corridors are defined in `packages/netz/src/corridors.ts` by ordered anchor stations; the build adds every station served between two anchors (station list taken from a reference day, Tuesday 2026-03-10), places stations by track distance (GTFS `shape_dist_traveled`, haversine fallback), and collects every train of the year that stops at ≥ 2 corridor stations, with its arrival/departure minutes per station. Runs with identical times on different days are stored once with a **running-days bitset** (same encoding as the train index), so any date of the timetable period can be shown. Details: [packages/netz/README.md](../packages/netz/README.md).

Limits: planned timetable (December snapshot), no realtime; dates outside the timetable period show no trains; ÖBB GTFS only (no WESTbahn/GKB/GySEV trains); trains passing a station without stopping have no time there (lines connect the stops).

## How it is shown

- **Index** (`/bf`): all corridors with main stations, length, stations, trains/day (on the reference Tuesday) and the mix of train categories; filter by corridor or station name, sortable.
- **Diagram**: x = km along the corridor (major stations bold), y = time downwards. Each train is a polyline through its stops (vertical segments = dwell time), coloured by category; steeper = slower. Regional/S-Bahn lines are thinner.
- **Date** (`?d=YYYY-MM-DD`, default today): date picker, ‹ › for previous/next day; only trains running on that date are drawn, with the train count.
- Window: start hour ▲▼ and 2/4/8/24 h; the dashed red line is the current time (only when today is shown). Category chips hide/show categories.
- Hover highlights a train (number and destination below the chart); click opens its live train run on the selected date.
