# Bildfahrplan (time–distance diagram)

`/bf` (index), `/bf/<corridor>?from=<hour>&h=<hours>`

## Data

Built by `vp run netz:build` from the **ÖBB GTFS** for one reference day (a regular Tuesday, 2026-03-10). Corridors are defined in `packages/netz/src/corridors.ts` by ordered anchor stations; the build adds every station served between two anchors, places stations by track distance (GTFS `shape_dist_traveled`, haversine fallback), and collects every train of that day that stops at ≥ 2 corridor stations, with its arrival/departure minutes per station. Details: [packages/netz/README.md](../packages/netz/README.md).

Limits: one planned weekday, no realtime; ÖBB GTFS only (no WESTbahn/GKB/GySEV trains); trains passing a station without stopping have no time there (lines connect the stops).

## How it is shown

- **Index** (`/bf`): all corridors with main stations, length, stations, trains/day and the mix of train categories; filter by corridor or station name, sortable.
- **Diagram**: x = km along the corridor (major stations bold), y = time downwards. Each train is a polyline through its stops (vertical segments = dwell time), coloured by category; steeper = slower. Regional/S-Bahn lines are thinner.
- Window: start hour ▲▼ and 2/4/8/24 h; the dashed red line is the current time of day. Category chips hide/show categories.
- Hover highlights a train (number and destination below the chart); click opens its live train run for today.
