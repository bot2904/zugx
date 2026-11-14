# @zugx/netz

GTFS → ITF analysis → Netzgrafik model, Netzgrafik-Editor export and Bildfahrplan
corridors (PLAN.md §5.5, §7).

Data: **ÖBB Soll-Fahrplan GTFS 2026, CC BY 4.0** (© ÖBB-Personenverkehr AG,
<https://data.oebb.at/de/datensaetze~soll-fahrplan-gtfs~>). The generated files in
`data/` are derived from it and carry `"source": "ÖBB GTFS 2026 (CC BY 4.0)"`.

```sh
pnpm install
./node_modules/.bin/vp run netz:build            # = vpx packages/netz/src/build.ts
./node_modules/.bin/vpx packages/netz/src/build.ts --day=2026-03-10 --cats=RJX,RJ,IC --candidates
./node_modules/.bin/vp test run --root packages/netz
```

GTFS input: `GTFS_DIR` (unzipped feed) or `GTFS_ZIP`, else `<repo>/.cache/GTFS_Fahrplan_2026.zip`
(downloaded on first run, ~170 MB; `shapes.txt` is never unpacked — distances come from
`stop_times.shape_dist_traveled`). A full build takes about one second.

Only trips running on the **reference day** (default `2026-03-10`, a regular Tuesday
outside school holidays; `--day=`) are used. Bus routes (`route_type` 3, SEV) are dropped;
stops are resolved to their parent station DHID (`at:48:817:0:2` → `Pat:48:817`, derived
when `parent_station` is empty, e.g. Feldkirch, Bludenz).

| File                        | Type (`src/types.ts`) | Content                                 |
| --------------------------- | --------------------- | --------------------------------------- |
| `data/netz.toml`            | `NetzModel`           | Knoten, Takt lines, edges, Knotenzeiten |
| `data/nge.json`             | `NgeDto` (`nge.ts`)   | same model as Netzgrafik-Editor JSON    |
| `data/corridors/index.toml` | `CorridorIndex`       | list of corridors                       |
| `data/corridors/<id>.toml`  | `Corridor`            | time–distance data (one train per line) |

The UI imports the types from `@zugx/netz` (`src/types.ts`).

## Netzgrafik model (`netz.toml`)

```jsonc
{
  "day": "2026-03-10",
  "source": "ÖBB GTFS 2026 (CC BY 4.0)",
  "cats": ["RJX", "RJ", "ICE", "EC", "IC", "D", "IR", "CJX", "REX"],
  "nodes": [
    {
      "id": "Pat:44:41164",
      "code": "LZ",
      "name": "Linz Hbf",
      "lat": 48.29068,
      "lon": 14.29117,
      "x": 74.3,
      "y": -76.8, // km, equirectangular around 47.6°N 13.3°E (y grows south)
      "lines": 25, // line directions touching the node
      "knots": {
        "arr": [/* 60 */],
        "dep": [/* 60 */],
        "minutes": [15, 45],
        "type": "viertel",
        "share": 0.58,
      },
    },
  ],
  "lines": [
    {
      "id": "IR-klagenfurt-hbf-graz-hbf",
      "cat": "IR",
      "name": "Klagenfurt Hbf – Graz Hbf",
      "takt": 60, // 15 | 30 | 60 | 120 | null (= "zeitweise"), of the forward direction
      "fwd": {
        "to": "Graz Hbf",
        "takt": 60, // per direction (the opposite one may differ)
        "trips": 16,
        "numbers": "IR 581–589, 681, …",
        "first": "06:11",
        "last": "20:11",
        "stops": [
          { "node": "Pat:42:3642", "arr": null, "dep": 11 },
          { "node": "…", "arr": 21, "dep": 22, "pass": true },
        ],
        "travel": [70, 10, 37], // minutes between consecutive stops
      },
      "back": {/* same shape, opposite direction, its own travel order */},
      "symmetry": 0, // deviation of the symmetry axis from :00/:30 in minutes
    },
  ],
  "edges": [
    {
      "a": "Pat:42:3642",
      "b": "Pat:46:6344",
      "km": 153.1,
      "lines": [
        {
          "line": "IR-…",
          "aDep": 11,
          "bArr": 21,
          "bDep": 38,
          "aArr": 48,
          "travel": 70,
          "travelBack": 70,
        },
      ],
    },
  ],
}
```

- **Nodes** are a curated list (`src/nodes.ts`, 46 candidates, nodes without lines are dropped)
  of hubs, junctions and border points. `--candidates` prints the data-driven ranking
  (departures of the selected categories + number of neighbouring stations) to help curating.
  `code` is a zugx short code (not an official ÖBB Betriebsstellen-Abkürzung). If
  `packages/stations/data/gtfs-hafas-map.toml` exists at build time, nodes get a `hafasId`.
- **Categories**: Takt-relevant long-distance and regional-express trains by default
  (`RJX RJ ICE EC IC D IR CJX REX`); night trains and R/S are left out (`--cats=` to change).
- **Minutes** are 0–59. For Takt < 60 they are the first slot of the hour (a 30' line at
  `dep: 7` also departs at :37). `pass: true` marks a node passed without stop (time interpolated).
- **Knotenzeiten** (`knots`): every Takt line contributes its arrival/departure minutes,
  expanded over the hour (`arr`/`dep` histograms). A knot at minute _k_ explains arrivals
  up to 10' before and departures up to 10' after _k_; `minutes` is the knot set (one of
  `[0]`, `[30]`, `[15]`, `[45]`, `[0,30]`, `[15,45]`) explaining most events (≥ 50 %),
  `type` is `voll` (:00 / :00+:30), `halb` (:30) or `viertel` (:15/:45).

### Pipeline (`src/netz.ts`)

1. Project every trip of the day onto the node set (keep only stops at nodes).
2. Edge lengths: median `shape_dist_traveled` difference per node pair. A nonstop hop A→C is
   expanded to A→B→C (`pass: true`, time interpolated by distance) when a chain of other
   edges has the same track length (±4 %), e.g. RJX passing Amstetten or Wels.
3. Group trips by (category, node sequence = direction). Short-run variants whose sequence is
   a contiguous part of a longer pattern of the same category are merged into it.
4. **Takt detection** (`src/takt.ts`) on the departures at the pattern's best-served node
   (partial runs extrapolated with median running times): for T = 15, 30, 60, 120 find the
   phase (minute mod T) hit by most departures within ±3 min in the 06–20 h window, then count
   the filled slots _phase + k·T_ between the first and last hit; the smallest T with ≥ 75 % of
   the slots filled (≥ 5 slots for 15/30, ≥ 3 otherwise) wins. Its members form a family; the
   rest is analysed again (second family = separate line, e.g. two hourly lines with
   different minutes); leftovers without Takt are counted as extra trips of the main family.
   Patterns without any Takt but ≥ 2 trips become `takt: null` lines.
5. Per family: node minutes and travel times are taken from the medoid through train (the one
   closest to the per-stop circular medians mod T), so arr/dep/travel stay consistent even when
   dwell times vary; plus trip count, train-number ranges, first/last departure.
6. Pair opposite directions (same category, reversed sequence preferred, containment allowed, same
   Takt preferred — each direction keeps its own `takt`) and compute
   the **symmetry** check: for each node, `(dep_fwd + arr_back) / 2` and `(arr_fwd + dep_back) / 2`
   modulo 30 (modulo T/2 for T < 60, the smaller T of both directions) is the local symmetry
   axis; `symmetry` is the median deviation from :00/:30 in [−15, 15) (0 = ITF-symmetric; most
   ÖBB Takt lines come out at 0 or −0.5).
7. Edges collect the per-line minutes at both ends; nodes get the Knotenzeiten summary.

## Netzgrafik-Editor export (`nge.json`)

`data/nge.json` follows `NetzgrafikDto` of SBB's Netzgrafik-Editor
(<https://github.com/OpenRailAssociation/netzgrafik-editor-frontend>,
`src/app/data-structures/business.data.structures.ts`) in the **3rd-party import** flavour
documented in `documentation/technical/DATA_MODEL_JSON.md`: nodes have empty
`ports`/`transitions`/`connections`, sections carry no `path`, and each trainrun's sections are
listed in travel order. On import NGE creates ports, transitions (nonstop where arrival =
departure minute, i.e. our `pass` nodes), resources and the edge routing itself.

- one trainrun per line (`round_trip` if paired with the same Takt, else one `one_way` trainrun
  per direction with mirrored backward times), with an empty name (NGE then labels it with just the category, ÖBB has no line numbers), labelled with its
  category;
- categories RJX/RJ/ICE → colour `EC`, EC/IC → `IC`, D/IR → `IR`, CJX/REX → `RE`;
- frequency 15/30/60/120 (120 even/odd hour from the first departure), `takt: null` → 60 with
  time category "zeitweise";
- `travelTime` is adjusted by ≤ 30 min so that departure + travel ≡ arrival (mod 60);
- node positions: **schematic layout** (`schematic.ts`), SBB style: near the geographic position,
  on NGE's 32 px grid, connections exactly horizontal or vertical where possible. Each node pair
  becomes horizontal or vertical by its geographic angle (heaviest first): both nodes share a
  row/column and keep their order with ≥ 192 px for the time labels; contradicting connections
  (cycles), or ones whose row already holds a station between the two ends, try the other axis or
  stay diagonal. Node sizes are computed like NGE does (32 px per port on a side, ports on the side
  facing the other node), coordinates are the longest path over the order constraints with the
  geography (6 px/km) as lower bound, and overlapping nodes get separation constraints until there
  are none. Weekday network: 0 overlaps, 48 of 50 connections straight;
- `trafficSide: "leftHand"` (ÖBB), plus a note with source and reference day.

**Import**: open the public demo <https://nge.flatland.cloud> (or a local NGE), open the
side bar "Filter/Editor tools" (the wrench/tools icon), choose **"Import netzgrafik as JSON"**
and select `packages/netz/data/nge.json`. NGE logs "3rd party import" and routes all sections.

`test/nge.test.ts` validates the DTO structurally (required fields of nodes, trainruns,
sections, metadata; references; unique `betriebspunktName`; section chains; time consistency)
for a synthetic model and for the generated file.

## Bildfahrplan corridors (`corridors/*.toml`)

```jsonc
{"id":"westbahn","name":"Westbahn Wien – Salzburg","day":"2026-03-10","source":"…",
  "stations": [
    {"id":"Pat:49:1349","name":"Wien Hbf","km":0,"major":true},
    …
  ],
  "trains": [
    {"cat":"RJX","nr":"368","dir":1,"headsign":"Bolzano","pts":[[0,null,328],[2,333,335],[4,357,359],[29,403,405],[60,473,null]]},
    …
  ]
}
```

- `pts` = `[stationIndex, arr, dep]` in minutes since midnight of the reference day (> 1440 after
  midnight), only for corridor stations where the train has times; `arr` is null where the train
  enters/starts, `dep` null where it leaves/ends within the corridor. `dir` 1 = increasing km.
- Corridors are defined by anchor stations (`src/corridors.ts`): Westbahn (Wien Hbf – Meidling –
  Tullnerfeld – St. Pölten – … – Salzburg), Südbahn (Wien Hbf – Baden – Wiener Neustadt –
  Semmering – Bruck/Mur – Graz), Koralmbahn (Graz – Weststeiermark – St. Paul – Klagenfurt –
  Villach), Brenner (Kufstein – Wörgl – Jenbach – Innsbruck – Brennero).
- Stations: anchors plus every station served between two consecutive anchors by a trip stopping
  at both — unless that trip's anchor-to-anchor distance is > 12 % longer than the shortest (a
  parallel line) or the segment is marked `nonstop` (Neue Westbahn Tullnerfeld–St. Pölten vs.
  Tullnerfelder Bahn; Koralmbahn St. Paul–Kühnsdorf vs. Jauntalbahn via Bleiburg).
- km: median track distance between anchors (shape_dist_traveled), intermediate stations placed
  by their relative position between the anchors (haversine fallback).
- Trains: every train of the day (all categories incl. S/R/NJ) with ≥ 2 consecutive corridor stops
  in monotonic order. A non-corridor stop in between (train left the corridor) splits the run; a
  train can therefore appear more than once (e.g. Tullnerfelder Bahn trains).

## Known gaps

- GTFS has no pass times: nonstop passes are only interpolated for Netzgrafik nodes; corridor
  trains show only their stops.
- Trains of the previous service day running after midnight are not included.
- Line patterns are per category and exact node sequence; alternating lines (e.g. RJX to
  Innsbruck and to Bregenz every 2 h) appear as separate 120' lines.
- Westbahn corridor follows the Neue Westbahn via Tullnerfeld; Wien Westbf / old line trains join
  at St. Pölten. Private operators (WESTbahn) are not in the ÖBB GTFS.

## Day types and running days

- **Netzgrafik** is built for three day types from reference days of the same regular week: Mon–Fri (`--day`, default Tue 2026-03-10) → `netz.toml` / `nge.json`, Saturday 2026-03-14 → `netz-saturday.toml` / `nge-saturday.json`, Sunday 2026-03-15 → `netz-sunday.toml` / `nge-sunday.json` (`DAY_TYPES` in `src/build.ts`).
- **Corridors** take their station list from the reference day, but their trains from the **whole timetable year** (`loadFeed(src, null)` + `serviceDays()`): runs with identical times are merged, and each carries `days`, a base64 bitset over `begin…end` (bit i = day `begin + i`, MSB first — same as the train index). The UI filters by date. Corridor/index `trains` counts and `cats` refer to the reference day.
