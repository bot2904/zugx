# VzG-Grafik (speed profile per line and track)

`/vzg` (index), `/vzg/<line>?t=<track>&z=<px per km>&rev=1&all=1`, e.g. `/vzg/101-01?t=2`, `/vzg/stubaitalbahn`

## Data

**OpenStreetMap**, © OpenStreetMap contributors, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Source: the [Geofabrik](https://download.geofabrik.de/europe/austria.html) Austria extract `austria-261113.osm.pbf` (OSM data as of 2026-11-13), extracted 2026-11-14. The committed files `packages/vzg/data/*.toml` are a derived database under the ODbL (`packages/vzg/data/LICENSE.md`), separate from the AGPL code.

Built manually for now (download the PBF to `.cache/` first):

```sh
vp run vzg:extract   # .cache/austria-*.osm.pbf → .cache/osm-rail.json (rail ways, route=tracks, nodes; ~25 s)
vp run vzg:build     # → packages/vzg/data/<ref>.toml + index.toml (~6 s)
```

Besides the ÖBB lines, every other OSM `route=tracks` relation with a name whose ways are mostly in Austria is built too: private and narrow-gauge railways and light rail (Stubaitalbahn, Innsbrucker Mittelgebirgsbahn, Zillertalbahn, Lokalbahn Wien–Baden, StH, SLB, Achenseebahn …; 28 lines), with an id from the name (`/vzg/stubaitalbahn`), operator and gauge. Relations that duplicate an ÖBB line (NÖVOG's Waldviertelbahn = 177 01/179 01) are skipped. The extract keeps `railway=rail`, `narrow_gauge`, `light_rail` and `tram` ways; tram stops on the track count as halts. Lines without OSM km positions are measured from their farthest end (km from 0).

Lines are the ÖBB **Streckennummern** as cut in the VzG ("Verzeichnis der örtlich zulässigen Geschwindigkeiten und Besonderheiten") and the Streckenlisten, from the OSM `route=tracks` relations (`ref` = "101 01"). Per line and Regelgleis (OSM `railway:track_ref` …1 / …2) the build takes the cheapest path through the track graph between the line's ends: the two farthest ends of its OSM relation (so double track that covers only part of a line, e.g. Salzburg – Taxenbach, doesn't cut the line short); if that path is a detour (much longer than its km range, a gap in the line) or impossible, the ends from the km positions instead. Along it, it records the km of each point (OSM `railway:position`, interpolated in between), the speed sections (`maxspeed`, `maxspeed:forward/backward`), the curve radii (estimated from the geometry), and the stations, halts and signals. Method, validation against an ÖBB VzG page and known gaps: [PLAN.md](../PLAN.md) ("VzG-Grafik"), code in `packages/vzg`.

Limits: OSM has no braking distances, gradients, second speed band or remarks (VzG columns 3, 4/5, 7 dash-dot, 9); 168 of 181 ÖBB lines built (+ 28 other railways), some only partly (gaps or wrong km positions in OSM).

## How it is shown

- **Index** (`/vzg`): one row per Streckennummer with name, from – to, single/double track, length and km range, stations, signals; filter by number ("10101" finds "101 01"), name or station; sortable.
- **Line**: header with number, name, operator, gauge, ends and a **Wikidata** link (DinoData; from the OSM relation's `wikidata` tag, 101 of 175 ÖBB lines). Vertical km axis in the direction of travel (Regelgleis 1 → increasing km, 2 → decreasing; ⇅ swaps). Columns: km · stations (■ station, ○ halt) and signals (red main, green distant, amber speed) · km of the speed changes · speed diagram (solid = direction of travel, dash-dot = opposite direction where different) · curve radii (darker = tighter) · km. Scale 15–250 px/km; "All signals" adds shunting/minor/electricity signals. Hover shows details.
- **SVG export** (button "⤓ SVG"): the current chart (track, direction, scale, signal selection) as a standalone SVG for e.g. **Wikimedia Commons** and railway articles — colours and fonts inlined (always light; fonts as recommended by Commons: Liberation Sans/Mono with Arial/Courier New and generic fallbacks), hover targets removed; caption (line, track, direction of travel, operator, km range), legend, data sources ("© OpenStreetMap contributors (ODbL 1.0), as of …; not official") and "Made with zugx" with the link to the view. File name e.g. `zugx_VzG_101_01_Westbahn_Gleis_2.svg`. On Commons: license the file under the ODbL as a work derived from OSM data (template `{{ODbL OpenStreetMap}}`) and keep the attribution.
