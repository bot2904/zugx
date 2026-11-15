# zugx feature docs

One page per feature: where the data comes from and how it is shown or computed.

| Feature          | URL                                                       | Data                                                                                                   | Doc                                                   |
| ---------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| Station search   | `/`, `/s?q=`                                              | local station index (ÖBB GTFS → HAFAS ids), HAFAS fallback                                             | [stations.md](stations.md)                            |
| Station board    | `/station/<id>`                                           | HAFAS `StationBoard` (live)                                                                            | [station-board.md](station-board.md)                  |
| Departure poster | `/station/<id>/plan?d=`                                   | ÖBB GTFS (static, any day of the timetable year)                                                       | [station-board.md](station-board.md#departure-poster) |
| Journey search   | `/j/<from>/<to>`, `/trip/<token>`                         | HAFAS `TripSearch`, `Reconstruction` (live)                                                            | [journeys.md](journeys.md)                            |
| Train run        | `/train/<id>`, `/train/RJX-162`                           | HAFAS `JourneyMatch`, `JourneyDetails` (live)                                                          | [train-run.md](train-run.md)                          |
| Live radar       | `/radar`                                                  | HAFAS `JourneyGeoPos` (live)                                                                           | [radar.md](radar.md)                                  |
| Disruptions      | `/him`                                                    | HAFAS `HimSearch` (live)                                                                               | [disruptions.md](disruptions.md)                      |
| Train index      | `/trains`                                                 | ÖBB GTFS (static) + HAFAS train names                                                                  | [train-index.md](train-index.md)                      |
| Bildfahrplan     | `/bf`, `/bf/<corridor>?d=&plan=`                          | ÖBB GTFS (static, any day of the timetable year), OSM tracks/speeds, HAFAS (live overlay, node boards) | [bildfahrplan.md](bildfahrplan.md)                    |
| Netzgrafik       | `/netz?day=`                                              | ÖBB GTFS (static, per day type: Mon–Fri, Sat, Sun)                                                     | [netzgrafik.md](netzgrafik.md)                        |
| VzG-Grafik       | `/vzg`, `/vzg/101-01?t=2`, `/vzg/101-01/map`, `/vzg/netz` | OpenStreetMap (static, Geofabrik extract, ODbL), ÖBB GTFS (trains per day)                             | [vzg.md](vzg.md)                                      |
| Add to calendar  | journey details                                           | the journey shown                                                                                      | [calendar.md](calendar.md)                            |
| Raw API view     | `{}` button / `d`                                         | the app's own HAFAS requests                                                                           | [raw-api.md](raw-api.md)                              |

## Data sources

- **ÖBB HAFAS** (`fahrplan.oebb.at/bin/mgate.exe`) — the unofficial JSON API behind ÖBB Scotty. Everything _live_ (realtime delays, platforms, routing, positions, disruptions). The browser talks to it through the same-origin proxy `/api/mgate` (Caddy in the container, Vite in dev); the request/response handling is in `packages/hafas`. Identical requests are cached in the browser for 30 s.
- **ÖBB open data GTFS** ([data.oebb.at](https://data.oebb.at/de/datensaetze~soll-fahrplan-gtfs~), CC BY 4.0) — the planned timetable of the timetable year. Everything _static_ (station index, train index, Bildfahrplan, Netzgrafik) is built from it in CI (`vp run stations:build`, `trains:build`, `netz:build`), committed as TOML and refreshed weekly by a pull request. Coverage: ÖBB-Personenverkehr, CAT, Montafonerbahn — **not** WESTbahn, GKB, Raaberbahn etc.
- **OpenStreetMap** ([Geofabrik](https://download.geofabrik.de/europe/austria.html) Austria extract, ODbL) — railway lines, tracks, speed limits, km positions, signals for the VzG-Grafik (`vp run vzg:extract`, `vzg:build`; manual for now). Also the map tiles (OpenFreeMap, OSM, OpenRailwayMap), loaded live.
- **Wikidata** (CC0) — ids of the VzG lines, from the OSM relations' `wikidata` tag (no query at build time); the Bildfahrplan sheets' railway lines come from the VzG data.

Timetable formats offered by Austrian open-data portals (DINO, GTFS, NeTEx) compared: [timetable-formats.md](timetable-formats.md). Planning tools used by experts in the DACH region (FBS, TPS, Viriato, RailSys …): [expert-tools.md](expert-tools.md).

How every committed TOML file is built from which GTFS files, OSM keys/tags and HAFAS lookups (Mermaid diagram): [data-flow.md](data-flow.md).

Licences and fetch dates of all sources: [README → Data & licences](../README.md#data--licences).

Times: HAFAS returns local times (`HHMMSS`, optionally with a day offset) plus a UTC offset; zugx keeps them as ISO strings with offset (`2026-11-13T12:24:00+01:00`), always in Europe/Vienna.
