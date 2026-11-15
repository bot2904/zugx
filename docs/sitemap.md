# Sitemap (as of 2026-11-15)

Every function of zugx, where to find it, and along three dimensions: **data** (Fahrplan = ÖBB GTFS of the timetable year · Live = ÖBB HAFAS realtime · OSM = OpenStreetMap infrastructure), **level** (Fahrplan = trains and times · Infra = lines, tracks, signals) and **form** (diagram · table · map).

| Function                                                                                       | Menu → where                                                      | URL                     | Data                     | Level              | Form                  |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------- | ------------------------ | ------------------ | --------------------- |
| Journey search (A → B)                                                                         | Suche                                                             | `/`, `/j/<from>/<to>`   | Live                     | Fahrplan           | table                 |
| Journey detail (legs, transfers)                                                               | Suche → a journey                                                 | `/trip/<recon>`         | Live                     | Fahrplan           | table + map           |
| Station search, near me                                                                        | Suche                                                             | `/s`                    | Fahrplan (station index) | –                  | list                  |
| Departure / arrival board                                                                      | Suche → station                                                   | `/station/<id>`         | Live                     | Fahrplan           | table                 |
| **Departure plan** (all departures of a day, poster style)                                     | Bahnhöfe → station; board → „Abfahrtsplan“; Kursbuch station name | `/station/<id>/plan?d=` | Fahrplan                 | Fahrplan           | table                 |
| **Station index** A–Z with ÖBB abbreviations                                                   | Bahnhöfe                                                          | `/stations?q=Kt,Vb`     | Fahrplan + OSM           | –                  | list                  |
| Train index (all trains of the year, filters)                                                  | Züge                                                              | `/trains/<op>/<cat>`    | Fahrplan                 | Fahrplan           | table                 |
| Train run (stops, actual times, delay profile, map, train parts)                               | Züge → train; everywhere a train badge                            | `/train/<RJX-162>?d=`   | Live                     | Fahrplan           | table + diagram + map |
| Live radar (positions, delay classes, donut, train parts)                                      | Radar                                                             | `/radar?trip=`          | Live                     | Fahrplan           | map                   |
| Disruptions                                                                                    | Störungen                                                         | `/him`                  | Live                     | Fahrplan           | list                  |
| Sheet index (ÖBB Fahrplanbilder)                                                               | Bildfahrplan                                                      | `/bf`                   | Fahrplan                 | Fahrplan           | table + mini diagrams |
| Graphic timetable (time–distance)                                                              | Bildfahrplan → sheet                                              | `/bf/<sheet>`           | Fahrplan                 | Fahrplan           | diagram               |
| ↳ single/double track band                                                                     | Bildfahrplan (top edge)                                           |                         | OSM                      | Infra              | diagram               |
| ↳ realtime overlay                                                                             | Bildfahrplan → „Echtzeit“                                         | `?live=1`               | Live                     | Fahrplan           | diagram               |
| ↳ **Kursbuch** table (both directions, links to branching sheets)                              | Bildfahrplan (below the chart)                                    |                         | Fahrplan (+ Live)        | Fahrplan           | table                 |
| ↳ transposed table (a row per train)                                                           | Bildfahrplan → „Transponieren“                                    | `?transpose=1`          | Fahrplan                 | Fahrplan           | table                 |
| ↳ train run panel                                                                              | Bildfahrplan → click a train                                      | `?train=`               | Live                     | Fahrplan           | table                 |
| ↳ **Knoten** (transfers, Taktknoten)                                                           | Bildfahrplan → Planung                                            | `?plan=knoten`          | Fahrplan + Live boards   | Fahrplan           | table                 |
| ↳ **Kreuzungen** (meetings on single track, buffers)                                           | Bildfahrplan → Planung                                            | `?plan=kreuzung`        | Fahrplan (+ Live)        | Fahrplan × Infra   | table + diagram marks |
| ↳ **Fahrzeitreserve** (slack vs. permitted speed)                                              | Bildfahrplan → Planung                                            | `?plan=reserve`         | Fahrplan + OSM           | Fahrplan × Infra   | table                 |
| ↳ **Pünktlichkeit** (where trains lose time)                                                   | Bildfahrplan → Planung                                            | `?plan=puenktlichkeit`  | Live                     | Fahrplan           | table                 |
| ↳ **Kapazität** (blocking times, occupancy, conflicts)                                         | Bildfahrplan → Planung                                            | `?plan=kapazitaet`      | Fahrplan + OSM signals   | Fahrplan × Infra   | table + diagram boxes |
| Line index (VzG lines)                                                                         | VzG-Grafik                                                        | `/vzg`                  | OSM                      | Infra              | table                 |
| VzG chart (speeds, signals, structures, gradients per line)                                    | VzG-Grafik → line                                                 | `/vzg/<line>`           | OSM                      | Infra              | diagram               |
| ↳ line profile (length, double track, speeds, trains/day)                                      | VzG-Grafik → line (box)                                           |                         | OSM + Fahrplan           | Infra              | table                 |
| Line map (Streckenkarte, SVG export)                                                           | VzG-Grafik → line → Karte                                         | `/vzg/<line>/map`       | OSM                      | Infra              | map                   |
| **Infrastructure network map** by speed / electrification / ETCS / tracks / **trains per day** | VzG-Grafik → Infrastrukturnetzkarte                               | `/vzg/netz?region=`     | OSM (+ Fahrplan density) | Infra (+ Fahrplan) | map                   |
| Netzgrafik (lines and nodes, NGE export)                                                       | Netzgrafik                                                        | `/netz/<region>`        | Fahrplan                 | Fahrplan           | diagram               |
| Command palette (jump to station/train/sheet/line)                                             | ⌘K                                                                |                         | all                      | –                  | –                     |

## Hidden or misleadingly named

- **Departure plan** (timetable) lives under a station, but the menu only offers „Suche“ (live); now also reachable via „Bahnhöfe“.
- **Infrastructure network map** and **trains per day** (traffic density) are under „VzG-Grafik“, which suggests one line's speed chart.
- **Kursbuch** and the five **planning panels** are below/inside „Bildfahrplan“; nothing in the menu says timetable tables or capacity.
- **Netzgrafik** vs. **Netzkarte**: similar names, different things (timetable diagram vs. infrastructure map) — renamed to **Infrastrukturnetzkarte**.
- **Live** is a toggle in the Bildfahrplan but a separate page elsewhere (board, radar).

## Plan: new navigation (draft, for discussion)

```
zugx   Suche ●   Radar ●   Störungen ●   Fahrplan ▾   Infrastruktur ▾   Hilfe      [● Live]   ⌘K  DE  ☀
```

● = the live dot: **● (U+25CF)**, coloured with the CSS variable **`--live`** (red, its own name rather than `--bad`) and slowly pulsing when live is on (class `.live-dot.on`; no animation with `prefers-reduced-motion`); grey when off. On the **Live** switch it shows the state; as a **suffix** it marks entries that are always live — Suche, Radar, Störungen — so the switch doesn't apply to them and they are never greyed out. (Not 🔴: an emoji looks different per platform and can't turn grey.)

**Three live entries, two dropdowns, one switch.** Suche stays the start page; Radar and Störungen are main entries next to it (all three always live). Fahrplan and Infrastruktur are dropdowns. The **Live** switch (top right, remembered, also `?live=1` in links) decides whether a page shows the timetable (GTFS) or the realtime (HAFAS) where both exist.

| Menu            | Entry                              | Live off (timetable)                                    | Live on (realtime)                  | Today                               |
| --------------- | ---------------------------------- | ------------------------------------------------------- | ----------------------------------- | ----------------------------------- |
| Suche ●         | journey search                     | – (always live)                                         | journeys, journey detail            | `/`, `/j`, `/trip`                  |
| Radar ●         | radar                              | – (always live)                                         | live positions                      | `/radar`                            |
| Störungen ●     | disruptions                        | – (always live)                                         | disruption reports                  | `/him`                              |
| Fahrplan ▾      | Bahnhöfe                           | index → **Abfahrtsplan**                                | index → **Abfahrtstafel**           | `/stations`, `/station/<id>[/plan]` |
|                 | Züge                               | train index → planned run                               | train index → train run with delays | `/trains`, `/train/<id>`            |
|                 | Bildfahrplan (+ Kursbuch, Planung) | chart, Kursbuch, Knoten, Kreuzungen, Reserve, Kapazität | + realtime overlay, Pünktlichkeit   | `/bf/<sheet>`                       |
|                 | Netzgrafik                         | nodes and lines                                         | – (same)                            | `/netz`                             |
| Infrastruktur ▾ | Strecken (VzG)                     | line index → VzG chart, line profile                    | – (same)                            | `/vzg`, `/vzg/<line>`               |
|                 | Streckenkarte                      | per line (from the line page)                           | – (same)                            | `/vzg/<line>/map`                   |
|                 | Infrastrukturnetzkarte             | speed, ETCS, tracks, trains/day                         | – (same)                            | `/vzg/netz`                         |
| Hilfe           | help, shortcuts                    |                                                         |                                     | `/help`                             |

URLs stay as they are (no redirects needed); only the menu and the switch are new. Live-only entries carry the ● suffix and work regardless of the switch.

### Not covered by this plan (gaps)

1. **Journey search** is live only (●) — there is no timetable-only router (GTFS). The switch has no effect there.
2. **Radar** and **Störungen** are live only (●) — the switch has no effect there either.
3. **Planned train run** without live doesn't exist yet: the train page always asks HAFAS. Needs a GTFS-based run (stops and times from the timetable data) for Live off.
4. **Netzgrafik** and all **Infrastruktur** pages have no live variant — the switch does nothing there (could later: delays on the network map, punctuality per node).
5. **Mixed views**: Knoten (timetable + live boards of other lines) and Kreuzungen (knock-on delays) use both; Live only adds to them.
6. **Switch vs. links**: a shared link must carry the mode (`?live=1`), otherwise the receiver sees the other mode; the switch then sets it for the session.
7. **Sheet ↔ line**: Bildfahrplan (Fahrplan, ÖBB sheet numbers) and VzG (Infrastruktur, line numbers) stay apart; cross-links exist (sheet header lists its lines) but no common "Strecke" page.
8. **Command palette, Bahnhöfe-search vs. Suche**: two station searches (journey search field and station index) remain.
