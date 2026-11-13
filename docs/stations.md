# Station search

## Data

- **Local index** `packages/stations/data/stations.json` (~1000 rail stations in Austria), built by `vp run stations:build`:
  1. Read the ÖBB GTFS, keep stations served by rail trips, group platforms by their parent station (DHID, e.g. `Pat:49:1349`).
  2. Map each station to its **HAFAS id** (what the live API needs, e.g. Wien Hbf = `8103000`): first by coordinates (HAFAS `LocGeoPos`, nearest rail station within 600 m), else by name (`LocMatch`); UIC ids (81…/80…), name similarity and number of rail products are preferred. The mapping is cached in `gtfs-hafas-map.json`, so weekly rebuilds only query new stations.
  3. Per station: HAFAS name, coordinates, train categories stopping there (`p`), aliases, and a **weight** `w` (1–1000, log scale of yearly departures, long-distance departures counted 5×) used for ranking.
- **HAFAS `LocMatch`** as fallback for anything not in the index (addresses, POIs, foreign stations).

## How it works

- The index is a separate, content-hashed JSON chunk loaded on first use and cached by the service worker (offline-capable).
- Search runs in the browser in a few milliseconds: names are normalized (lowercase, no diacritics, `ß→ss`), with variants for `ö→oe`, `Hbf↔Hauptbahnhof`, `Bf↔Bahnhof`, `St.↔Sankt`, `Wr.↔Wiener`. Every typed word must be a prefix of a word in the name.
- Ranking: exact name > name starts with query > first word matches, then by weight. So `wien` → Wien Hbf, `wr neu` → Wr.Neustadt Hbf, `moedl` → Mödling.
- If fewer than 5 local hits, HAFAS `LocMatch` results are added (marked ⌁).
- Empty input shows favourites (★) and recent stations (stored in `localStorage`). ⌖ picks the nearest station via the browser's geolocation.
