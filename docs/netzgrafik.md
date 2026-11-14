# Netzgrafik (integrated interval timetable)

`/netz`

## Data

Built by `vp run netz:build` from the **ÖBB GTFS** for three **day types**, each from a reference day of the same regular week: Mon–Fri (Tue 2026-03-10), Saturday (2026-03-14), Sunday/holiday (2026-03-15) → `netz.json`, `netz-saturday.json`, `netz-sunday.json` (+ matching NGE exports). Categories: long-distance and regional-express categories (RJX, RJ, ICE, EC, IC, D, IR, CJX, REX). Full description of the model and algorithm: [packages/netz/README.md](../packages/netz/README.md).

- **Nodes (Knoten)**: a curated list of ~45 hubs, junctions and border points.
- **Lines**: trips grouped by category and the sequence of nodes they serve; shorter runs that fit into a longer pattern are merged.
- **Takt detection**: for each line, departures at its best-served node between 06:00 and 20:00 are tested against 15/30/60/120-minute intervals (±3′); the smallest interval with ≥ 75 % of the expected slots filled wins, otherwise the line is "irregular" (–). A second regular family becomes its own line.
- **Minutes** at each node come from the most typical train of the line, so arrival + travel time = next arrival.
- **Symmetry**: deviation of a paired line's symmetry axis from the standard :00/:30.
- **Knotenzeiten**: per node, all arrival/departure minutes of the Takt lines (expanded over the hour); the knot is the minute (:00, :30, :15/:45) explaining most of them.

## How it is shown

- Day type switch (Mon–Fri / Sat / Sun/holiday, `?day=saturday|sunday`). An interval timetable is defined per day type, so arbitrary dates are not offered here (see the Bildfahrplan for that).

- Nodes are placed geographically; colour = knot type (red :00 Vollknoten, amber :30 Halbknoten, blue :15/:45, white none).
- Each line is a coloured section between consecutive nodes; width/dash = interval (30′ thick, 60′ normal, 120′ / irregular dashed). Parallel lines are offset.
- Minute labels near each end: `departure/arrival` at that node (departure dark, arrival grey), travel time in the middle — shown when a line is selected (or the graph is sparse).
- Click a node: its knot minutes, arrival/departure histogram over the hour, and lines. Click a line: interval, symmetry, trips, train numbers and the stop list per direction.
- **Download NGE JSON** exports the model of the selected day type for SBB's open-source [Netzgrafik-Editor](https://github.com/OpenRailAssociation/netzgrafik-editor-frontend) (import "Netzgrafik as JSON"). Stations are laid out schematically (near their geographic position, on a grid, connections horizontal or vertical) so the network is readable in the editor without manual work.
