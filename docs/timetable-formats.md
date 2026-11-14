# Timetable formats: DINO, GTFS, NeTEx

The Austrian open-data portal [data.mobilitaetsverbuende.at](https://data.mobilitaetsverbuende.at/) offers operator timetables (e.g. "Fahrplandaten Linz AG") in three formats: **DINO**, **GTFS** and **NeTEx**. All three describe the same planned timetable; they differ in origin, structure and how much they can express. (Licence and usage conditions of that portal: see PLAN.md, "WESTbahn & other operators".)

|              | DINO                                              | GTFS                                      | NeTEx (Austrian profile)                               |
| ------------ | ------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------ |
| Origin       | MENTZ GmbH (DIVA/EFA software), based on VDV 452  | Google, now MobilityData (community spec) | CEN TS 16614 (Transmodel), EU standard; profile EPIP   |
| Container    | `.din` text tables (CSV-like, `;`)                | `.txt` CSV files in a ZIP                 | XML (`PublicationDelivery` with frames)                |
| Encoding     | Windows-1252 by default (or UTF-8, declared)      | UTF-8                                     | UTF-8 (XML)                                            |
| Trip times   | departure + travel/stop times per route pattern   | explicit time per stop (`stop_times.txt`) | `TimetabledPassingTime` per stop, per `ServiceJourney` |
| Service days | day types + monthly bit fields                    | weekday pattern + date exceptions         | `DayType` + `DayTypeAssignment` / `OperatingPeriod`    |
| Stops        | stop / area / stopping point (platform), IFOPT id | `stops.txt` (station/platform hierarchy)  | `StopPlace`/`Quay` + `ScheduledStopPoint` + assignment |
| Coordinates  | per `coordsys.din` (e.g. WGS 84, MRCV)            | WGS 84                                    | WGS 84 recommended                                     |
| Use in zugx  | –                                                 | yes (ÖBB GTFS → all static data)          | –                                                      |

## DINO

**What**: the exchange format of MENTZ's DIVA timetable system (used by many German/Austrian/Swiss transport associations). Current version **DINO 2.3** (description dated 03.04.2023, © Mentz GmbH). Based on the VDV-DIVA format, which follows the German VDV standard (VDV 452, version 5.0/5.1); deviates from it mainly in how trip times and day types are modelled. DINO 2.x is not backward compatible with 1.x (tables were renamed).

**Files**: one table per file, `<table>.din` (file name lower case). First line = header row with the column names (VDV style). Separator `;` by default (CSV rules per [csv-spec.org](https://csv-spec.org/): quotes around fields containing the separator or line breaks, no separator at line end). Encoding Windows-1252 unless declared in `character_set.din`. Times are seconds (e.g. `DEPARTURE_TIME`), dates `YYYYMMDD`. Most tables carry a `VERSION` column (the timetable period from `version.din`).

**Tables** (DINO 2.x name ← name up to DINO 1.7):

- Calendar: `version.din` ← `set_version.din` (timetable periods, e.g. "s17" with validity dates), `day_type.din` ← `set_day_type.din`, `day_attribute.din` ← `set_day_attribute.din`, `day_type_2_day_attribute.din`, `day_type_calendar.din` ← `calendar_of_the_company.din`, `service_restriction.din`
- Stops: `stop.din` ← `rec_stop.din`, `stop_area.din` ← `rec_stop_area.din`, `stop_point.din` ← `rec_stopping_points.din`, `stop_footpath.din` ← `rec_footpath.din`, `stop_additional_name.din`, `stop_alias_placename.din`, `coordsys.din`
- Fares: `fare_zone.din`, `neighbour_fare_zone.din`, `fare_zone_transition.din`, `fare_zone_transition_point.din`
- Network/operations: `means_of_transport_desc.din`, `transfer_matrix.din`, `vehicle_type.din`, `operator.din`, `operator_branch_office.din`, `depot.din`, `branch.din`, `timing_pattern.din` ← `lid_travel_time_type.din`, `route.din` ← `lid_course.din`, `trip_purpose.din`, `line.din` ← `rec_lin_ber.din`, `vehicle_destination_text.din`, `trip_vdt.din`, `train_category.din`, `line_suppression.din`
- Timetable: `trip.din` ← `rec_trip.din`, `trip_stop_time.din`, `vehicle_block.din` ← `rec_round_trip.din`, `notice.din`, `notice_str.din` ← `hinw_str.din`, `service_constraint.din` ← `service_interdiction.din`
- Interchanges: `connection.din`, `interchange_definition.din`, `interchange_validity.din`; geometry: `link.din`, `link_geometry.din`, `link_force_point.din`; custom attributes: `attribute.din`, `stop_attribute.din`, `stop_area_attribute.din`, `stop_point_attribute.din`, `line_attribute.din`

Minimum set for a delivery: `version`, `day_type`, `day_attribute`, `day_type_2_day_attribute`, `day_type_calendar`, `service_restriction`, `stop`, `stop_area`, `stop_point`, `stop_footpath`, `timing_pattern`, `route`, `line`, `trip`, `trip_stop_time`, `notice`, `service_constraint`, `notice_str`.

**Timetable model**:

- A line (`line.din`, `LINE_NR`) has routes = stop sequences per variant and direction (`route.din`: `STR_LINE_VAR`, `LINE_DIR_NR`, `LINE_CONSEC_NR` → stop / stopping point).
- `timing_pattern.din` gives per route and _timing group_ (`TIMING_GROUP_NR`) the travel time from the previous stop (`TT_REL`, seconds) and the dwell time (`STOPPING_TIME`).
- A trip (`trip.din`, unique by `LINE_NR` + `TRIP_ID`) references line, route, timing group and has only its **departure time** (seconds) and first/last stop; all other times follow from the timing pattern. `trip_stop_time.din` overrides the waiting time at single stops of single trips. Optional: `TRAIN_NR`, `TRAIN_CATEGORY_SHORT_NAME`, notices, vehicle type.
- Service days: each calendar day of the period gets exactly one day type (`day_type_calendar.din`); day types are grouped into day attributes (e.g. "Mon–Fri school"); a trip names a `DAY_ATTRIBUTE_NR` and optionally a `RESTRICTION` from `service_restriction.din`: a bit field per month (32-bit word, bit 0 = 1st of the month), written in hex, 8 characters per month, between `DATE_FROM` and `DATE_UNTIL`.
- Stops: `stop.din` (stop, with optional `GLOBAL_ID` = IFOPT id, coordinates `STOP_POS_X/Y` in the system of `coordsys.din`), `stop_area.din` (areas within it), `stop_point.din` (stopping points/platforms).

**Spec**: [DINO 2.3 description (EN)](https://www.oev-info.ch/sites/default/files/2023-07/description_exchange_format_dino_v2.3.0_03.04.2023_published_en.pdf), [German](https://www.tp-info.ch/sites/default/files/2023-06/beschreibung_austauschformat_dino_v2.3.0_03.04.2023_published.pdf) (hosted by the Swiss timetable bodies, which accept DINO deliveries).

## GTFS (General Transit Feed Specification)

**What**: the de-facto standard for planned timetables in journey planners (Google Maps, OpenTripPlanner, …), maintained by [MobilityData](https://gtfs.org/). zugx builds all its static data (stations, train index, Bildfahrplan, Netzgrafik) from the ÖBB GTFS.

**Files**: ZIP of UTF-8 CSV files (`.txt`, header row, `,`).

- required: `agency.txt`, `routes.txt` (line, `route_type`), `trips.txt` (journey: route, service, headsign, `shape_id`), `stop_times.txt` (per trip and stop: `arrival_time`, `departure_time`, `stop_sequence`, optional `shape_dist_traveled`), `stops.txt` (stops, stations via `location_type`/`parent_station`, platforms, WGS 84)
- service days: `calendar.txt` (weekday pattern + date range) and/or `calendar_dates.txt` (added/removed dates)
- optional: `shapes.txt` (geometry), `transfers.txt`, `frequencies.txt`, `feed_info.txt`, `fare_*`, pathways/levels, translations, …
- times `HH:MM:SS` relative to "noon minus 12 h" of the service day, may exceed 24:00 for trips after midnight; dates `YYYYMMDD`.

Simple and explicit (every time is written out), but flat: no line variants/route patterns as objects, no day types, limited operational detail. Realtime is a separate spec (GTFS-Realtime, protobuf).

**Spec**: [gtfs.org/documentation/schedule/reference](https://gtfs.org/documentation/schedule/reference/).

## NeTEx (Network Timetable Exchange) — Austrian profile

**What**: the European CEN standard (CEN TS 16614, based on the Transmodel data model) for exchanging networks, timetables and fares as XML. The EU requires it for national access points (delegated regulation 2017/1926); the **EPIP** (European Passenger Information Profile, CEN TS 16614-PI) is the minimal profile for passenger information. **Austrian NeTEx Profile V1.0**, published by Mobilitätsverbünde Österreich OG, is based on EPIP and implements **NeTEx XSD 1.10**; a versioning process "will be implemented in the future".

**Structure**: an XML `PublicationDelivery` containing _frames_ — versionable containers with validity conditions: `ResourceFrame` (operators, authorities, vehicle types), `SiteFrame` (stop places), `ServiceFrame` (network: lines, routes, journey patterns, scheduled stop points, assignments), `TimetableFrame` (journeys), `ServiceCalendarFrame` (day types, calendars), grouped in a `CompositeFrame`. EPIP restricts the `TypeOfFrame` values. (How Austrian deliveries are split into files and zipped is not documented on the public profile pages.)

**Timetable model** (Transmodel terms):

- `Line` (with transport mode/submode, operator/authority) → `Route`s (direction variants) → `ServiceJourneyPattern` (sequence of `StopPointInJourneyPattern`) over `ScheduledStopPoint`s.
- `ServiceJourney` (passenger journey; dead runs are not part of EPIP) with `TimetabledPassingTime`s per stop (arrival/departure, day offset).
- Calendar: a journey refers to `DayType`s only, never to dates; `DayTypeAssignment`s map day types to dates or `OperatingPeriod`s in the `ServiceCalendarFrame` (NeTEx also has `UicOperatingPeriod` with a valid-day bit string; whether the Austrian profile uses it is not stated on the public pages).
- Stops: the physical `StopPlace` with `Quay`s (platforms), linked to the timetable's `ScheduledStopPoint`s via `PassengerStopAssignment`. Austria includes the global ids, where available, as `KeyValue`s for now, aiming to use them as primary ids later (also for the planned national SIRI).
- WGS 84 coordinates "highly recommended"; many optional EPIP elements are not used in the Austrian profile.

Most expressive of the three (stop topology, accessibility, interchanges, fares, versioning), but verbose and complex to parse.

**Spec**: [Austrian NeTEx Profile](https://mobilitaetsverbuende.atlassian.net/wiki/spaces/NET/overview) (Confluence; XSD 1.10 as attachment), NeTEx XSD and examples on [GitHub NeTEx-CEN/NeTEx](https://github.com/NeTEx-CEN/NeTEx), [netex-cen.eu](https://netex-cen.eu/).

## Which one for zugx?

GTFS: zugx already has the whole pipeline (`packages/gtfs`, `packages/netz`), and the Linz AG GTFS would plug in directly (stations, Bildfahrplan). NeTEx would add stop topology and better ids, at the cost of an XML parser and a much bigger model. DINO needs the most work (times reconstructed from timing patterns, bit-field calendars, Windows-1252) for no extra information over GTFS for our purposes.

Sources: MENTZ DINO 2.3 description (03.04.2023); Austrian NeTEx Profile pages (Frames, Network and Timetables, Vehicle journeys and passing times, Calendars, Stop Places, Assigning Stops; read 2026-11-14); gtfs.org schedule reference.
