# VzG-Grafik (speed profile per line and track)

`/vzg` (index), `/vzg/<line>?t=<track>&z=<px per km>&rev=1&all=1`, e.g. `/vzg/101-01?t=2`

## Data

**OpenStreetMap**, © OpenStreetMap contributors, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Source: the [Geofabrik](https://download.geofabrik.de/europe/austria.html) Austria extract `austria-261113.osm.pbf` (OSM data as of 2026-11-13), extracted 2026-11-14. The committed files `packages/vzg/data/*.toml` are a derived database under the ODbL (`packages/vzg/data/LICENSE.md`), separate from the AGPL code.

Built manually for now (download the PBF to `.cache/` first):

```sh
vp run vzg:extract   # .cache/austria-*.osm.pbf → .cache/osm-rail.json (rail ways, route=tracks, nodes; ~25 s)
vp run vzg:build     # → packages/vzg/data/<ref>.toml + index.toml (~6 s)
```

Lines are the ÖBB **Streckennummern** as cut in the VzG ("Verzeichnis der örtlich zulässigen Geschwindigkeiten und Besonderheiten") and the Streckenlisten, from the OSM `route=tracks` relations (`ref` = "101 01"). Per line and Regelgleis (OSM `railway:track_ref` …1 / …2) the build takes the cheapest path through the track graph between the line's km extremes. Along it, it records the km of each point (OSM `railway:position`, interpolated in between), the speed sections (`maxspeed`, `maxspeed:forward/backward`), the curve radii (estimated from the geometry), and the stations, halts and signals. Method, validation against an ÖBB VzG page and known gaps: [PLAN.md](../PLAN.md) ("VzG-Grafik"), code in `packages/vzg`.

Limits: OSM has no braking distances, gradients, second speed band or remarks (VzG columns 3, 4/5, 7 dash-dot, 9); 156 of 181 lines built, some only partly (gaps or wrong km positions in OSM).

## How it is shown

- **Index** (`/vzg`): one row per Streckennummer with name, from – to, single/double track, length and km range, stations, signals; filter by number ("10101" finds "101 01"), name or station; sortable.
- **Line**: vertical km axis in the direction of travel (Regelgleis 1 → increasing km, 2 → decreasing; ⇅ swaps). Columns: km · stations (■ station, ○ halt) and signals (red main, green distant, amber speed) · km of the speed changes · speed diagram (solid = direction of travel, dash-dot = opposite direction where different) · curve radii (darker = tighter) · km. Scale 15–250 px/km; "All signals" adds shunting/minor/electricity signals. Hover shows details.
