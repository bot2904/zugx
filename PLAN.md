# zugx — a geeky ÖBB timetable web app

**https://zugx.legner.me**

> A fast, keyboard-first, information-dense timetable browser for Austrian (and neighbouring) public transport.
> Scotty's data, npmx.dev's feel. Later: Netzgrafik views of the Austrian integrated interval timetable (ITF / Taktfahrplan).

Status: **draft plan, open questions at the bottom**.

Name: **zugx** (decided).

Considered names (German railway terms):
| Name | Meaning |
|---|---|
| Kursbuch | printed book of all timetables; ÖBB still publishes one per timetable period |
| Bildfahrplan | time–distance diagram (graphic timetable) |
| Perron | old Austrian/Swiss word for platform (Bahnsteig) |
| Buchfahrplan | the train driver's timetable for one train |
| Taktknoten | node station where trains meet on the hour in an integrated interval timetable |
| Kondukteur | old Austrian word for conductor |
| Stellwerk | signal box; already used by many products and games |
| Drehscheibe | turntable; clashes with the "Drehscheibe Online" railway fan forum |

---

## 1. Goals / non-goals

**Goals**
- Journey search A → B (via, date/time, dep/arr, products filter, min. transfer time)
- Station boards (departures / arrivals) with realtime delays, platforms, cancellations
- Train detail ("Zuglauf"): all stops, times, delays, platform, composition if available
- Disruption info (HIM messages)
- **Train index**: every train running in Austria this timetable year, vagonweb-style, with links to vagonweb compositions (see §8)
- **Instant station search** from a local, pre-built station index (no network round trip per keystroke)
- **Excellent visualization** of found connections (see §5)
- Shareable, permalink-style URLs for everything
- Keyboard-first (`/` to focus search, arrow keys, `j/k`, shortcuts for earlier/later)
- Dark/light mode, dense "geek" layout, monospace accents, no fluff
- UI in **English, German, Italian** (i18n from day 1, `vue-i18n`; default from browser language)
- Responsive: dense tables/timelines on desktop, collapsing to cards on mobile; station board + journey search must work well on a phone

**Non-goals (for now)**
- Ticket sales / prices (decided: ignored; at most a deep link to the ÖBB ticket shop per journey)
- Delay history / punctuality statistics (decided: out of scope for now, idea kept — see §7, option C, and §11)
- Native apps (PWA is enough)
- User accounts

---

## 2. UI reference: npmx.dev

What to borrow from npmx.dev:
- Search-first landing page; `/` focuses search, arrow keys navigate results
- Dense, calm, typographic layout; dark mode by default with light mode toggle
- URL-compatible permalinks (npmx mirrors npmjs.com URLs → we could mirror sensible Scotty-ish URL patterns, but mainly our own clean ones)
- Fast: aggressive caching, small client bundles, instant local search
- npmx is built on Nuxt; we take the look & feel, but as a plain Vue SPA (see §6)

Proposed URL structure:

| Page | URL |
|---|---|
| Home / search | `/` |
| Station search | `/s?q=wien` |
| Station board | `/station/8103000` (`?arr`, `?t=2026-11-13T12:00`, `?products=…`) |
| Journey search | `/j/8103000/8100002?t=…&via=…&dep` |
| Journey detail (one result) | `/j/…/#3` or `/trip/<recon-token>` |
| Train run | `/train/<journeyId>` and friendly `/train/RJX-260?d=2026-11-13` |
| Disruptions | `/him` |
| Train index | `/trains` (see §8) |
| Netzgrafik (later) | `/netz/<region>` |

Station IDs = HAFAS/UIC "EVA"/IBNR numbers (Austrian stations are `81xxxxx`, e.g. Wien Hbf `8103000`).

---

## 3. Data source: ÖBB HAFAS `mgate.exe` API

### 3.1 How Öffi & friends talk to ÖBB
- **Öffi** (Andreas Schildbach) uses the library **public-transport-enabler (PTE)**, which has an `OebbProvider` extending its HAFAS provider base. Older versions used `fahrplan.oebb.at/bin/query.exe`; current PTE/others use the JSON **mgate** API.
- **KDE KPublicTransport** network config for ÖBB (at_oebb, 2026-04): endpoint `https://fahrplan.oebb.at/bin/mgate.exe`, auth `{type: "AID", aid: "OWDL4fE4ixNiPBBm"}`, client `{id: "OEBB", type: "AND"}`. Realtime coverage AT, regular coverage incl. CH, CZ, DE, HU, IT, …
- **hafas-client** (JS, `public-transport/hafas-client`) has an `oebb` profile (`hafas-client/p/oebb`). Good reference for request/response parsing (lines, products bitmask, remarks, polylines). Ports exist: pyhafas (Python), hafas-rs (Rust), fshafas (F#), hafas-client-php.
- Community docs (e.g. mitsuhiko's "oebb-scotty" agent skill) use `ver: "1.67"`, `client: {id:"OEBB", type:"WEB", name:"webapp", l:"vs_webapp"}`.

> ⚠️ Unofficial API. No SLA, no published ToS for third-party use, may change any time (AID / version bumps). Must be polite: caching, rate limiting, honest User-Agent with contact. We should design an adapter layer so we can swap sources.

### 3.2 Request envelope
```json
POST https://fahrplan.oebb.at/bin/mgate.exe
Content-Type: application/json

{
  "id": "1", "ver": "1.67", "lang": "deu",
  "auth":   { "type": "AID", "aid": "OWDL4fE4ixNiPBBm" },
  "client": { "id": "OEBB", "type": "WEB", "name": "webapp", "l": "vs_webapp" },
  "formatted": false,
  "svcReqL": [ { "meth": "LocMatch", "req": { "input": { "field": "S", "loc": { "name": "Wien Hbf", "type": "ALL" }, "maxLoc": 10 } } } ]
}
```
`svcReqL` can batch several requests in one HTTP call.

### 3.3 Methods we need
| Method | Use |
|---|---|
| `LocMatch` | station/address/POI search (fallback when local index misses, addresses/POIs) |
| `LocGeoPos` | nearby stations |
| `TripSearch` | journeys; `outCtxScrF`/`outCtxScrB` context tokens for "earlier/later" paging |
| `Reconstruction` | refresh a journey by its `ctxRecon` token (permalinks, live updates) |
| `StationBoard` | departures/arrivals (`type: DEP/ARR`) |
| `JourneyDetails` | full train run incl. stops, remarks, polyline |
| `JourneyGeoPos` / `JourneyMatch` | live train positions ("radar") / find train by number |
| `HimSearch` | disruptions |

Response quirks to handle (hafas-client has prior art for all of these):
- Common lookup tables in `res.common` (`locL`, `prodL`, `opL`, `remL`, `himL`, `polyL`), objects reference them by index
- Times as `HHMMSS` strings with optional day offset prefix (`01HHMMSS`), relative to a `date` (`YYYYMMDD`), Europe/Vienna
- Realtime vs planned: `dTimeS`/`dTimeR`, `dPlatfS`/`dPlatfR`, cancellations flags
- Coordinates as integers ×10⁶
- `lid` location strings: `A=1@O=Wien Hbf@L=8103000@…`
- Products as a class bitmask (`pCls`) → map to RJX/RJ/NJ/ICE/EC/IC/D/REX/R/S/Bus/…
- Encoded polylines (`polyG`/`crdEncYX`) for map display

### 3.4 No backend: static SPA + dumb reverse proxy (decided)
The browser can't call `mgate.exe` directly (no CORS headers). Instead of an app backend we serve the SPA and the API from **one origin**, so no CORS is needed at all:

```
browser ──► host Caddy (zugx.legner.me, TLS)
             └─► 127.0.0.1:8080  podman container "zugx" (Caddy, HTTP only)
                   ├─ /            → static Vue SPA (dist/, incl. hashed stations chunk)
                   └─ /api/mgate   → reverse_proxy https://fahrplan.oebb.at/bin/mgate.exe
```
The host Caddy only terminates TLS and forwards; everything app-specific is inside the container image, so the app is self-contained and versioned with the repo.

- All HAFAS logic (request building, parsing, normalizing) lives **in the browser** in `packages/hafas` (typed, framework-free TS). The AID is public anyway (it ships in the official apps).
- **Caddy** (decided), stock build:
  - only `POST`, `request_body max_size 8KB`, fixed upstream → it can't be abused as an open proxy
  - set an honest `User-Agent` with a contact
  - TLS automatic, as usual with Caddy
- Stock Caddy has **no response cache and no rate limiting**. Options:
  1. **Start without** (decided default): cache in the client instead (in-memory + IndexedDB, ~30 s TTL for boards/searches, dedupe in-flight identical requests). Fine at hobby traffic.
  2. Later, if needed, build Caddy with `xcaddy`: `github.com/mholt/caddy-ratelimit` for rate limits, and `github.com/caddyserver/cache-handler` (Souin) for caching — **to verify** whether it can key on the POST body (HAFAS is POST-only, so a cache needs the body in its key).
  3. Alternatively a ~50-line proxy sidecar (Go/Bun) behind Caddy that hashes the body and caches — only if 2 doesn't work.
- If we ever need more (sampling delays for statistics, push), we add a small service then — not now.
- Option: use `hafas-client` with the ÖBB profile in the browser vs. our own minimal typed client. Leaning towards **own small client** (only ~8 methods, no Node deps, tree-shakeable), using hafas-client as reference + test oracle.

### 3.5 Alternative / complementary sources
- **data.oebb.at** – ÖBB open data portal (has timetable data incl. GTFS / NeTEx sets and the Kursbuch PDFs). Use for the **station index** and later for **Netzgrafik/ITF analysis** (static schedule).
- Austria-wide GTFS/NeTEx from the Mobilitätsverbünde / national access point (mobilitydata.gv.at) – to verify coverage & licence.
- Neighbours later (DB, SBB opentransportdata.swiss GTFS) if cross-border matters.

---

## 4. Station cache ("super fast access")

Goal: station autocomplete returns results in < 5 ms after first load, works offline.

**Build step (CI, e.g. weekly cron)**
1. Source stations from **open data** GTFS/NeTEx (mobilitydata.gv.at / data.oebb.at — the same feed as the train index, §8) (decided), then map/verify each to its **HAFAS ID** (what the API needs) via `LocMatch` in CI. No HAFAS grid crawl.
2. Merge + dedupe; keep: `id`, `name`, `lat`, `lon`, product mask, "weight" (importance — e.g. number of departures/day or product class, so "Wien Hbf" beats "Wiener Neustadt Hbf" for `wien`), aliases/abbrev (e.g. `Wien Hbf`, `Wien Hauptbahnhof`, Betriebsstellen-Kürzel like `Wbf`?).
3. Write **`packages/stations/stations.json` — committed to the repo** (decided). Pretty-printed, one station per line, sorted by ID → readable, small `git diff`s show exactly which stations changed. Rail-only AT ≈ 1–2k stations → ~100–200 KB raw, a few tens of KB compressed.
4. A scheduled GitHub Action reruns the build weekly and **opens a PR** if the JSON changed (review the diff, merge). The build is never run at deploy time, so deploys are reproducible and don't depend on ÖBB being up.

Example entry:
```json
{"id":"8103000","name":"Wien Hbf","lat":48.185184,"lon":16.376413,"p":["RJX","RJ","NJ","EC","REX","R","S"],"w":1000,"alias":["Wien Hauptbahnhof"]}
```
(Coordinates illustrative.) A JSON Schema (`stations.schema.json`) + a CI check validates the file.

**Client**
- The SPA loads it with a dynamic `import('…/stations.json')` → Vite emits it as its own content-hashed chunk: cached forever by the browser, not in the main bundle, re-downloaded only when it changes
- Precached by the service worker (PWA, offline)
- Search: normalized (lowercase, strip diacritics: `ö→o`/`oe`, `ß→ss`, `St.`↔`Sankt`, `Hbf`↔`Hauptbahnhof`), prefix + fuzzy (e.g. `uFuzzy` or a small trigram/prefix index built in a Web Worker), ranked by weight
- Recents & favourites in `localStorage`; ranked above index hits
- Fallback to server `LocMatch` for addresses/POIs or zero hits

---

## 5. Visualizing connections

The main differentiator. Ideas, roughly in priority order:

1. **Timeline strip per journey ("Gantt row")** – horizontal time axis shared by all results on screen; each journey a row; each leg a bar coloured by product (RJX red, S-Bahn blue, bus, walk = dotted), transfers as gaps with transfer time labelled (red if tight). Realtime: planned bar ghosted behind actual. Scanning many results at once shows the Takt pattern instantly.
2. **Summary table, terminal-ish** – dep/arr (with `+3` delay superscripts), duration, transfers, products, platform; sortable; keyboard nav; expand inline.
3. **Leg detail / Zuglauf** – vertical line diagram with all intermediate stops, platforms, delay sparkline along the run, occupancy if provided, remarks/HIM inline.
4. **Map** – MapLibre GL + OSM/OpenRailwayMap tiles, legs as polylines from HAFAS geometry, live train position (`JourneyGeoPos`).
5. **Bildfahrplan (time–distance diagram)** – for a corridor (e.g. Westbahn Wien–Salzburg): x = distance/stations, y = time; every train a line. Perfect geek view and a bridge to §7.
6. **Transfer quality view** – for a connection, show alternatives if a transfer breaks ("what if I miss it?" → next options via `TripSearch` from the transfer station).

Tech: SVG via D3 scales (or plain Vue + computed SVG) for 1–3, 5; Canvas/WebGL only if data volume demands.

---

## 6. Proposed stack

| Concern | Choice | Notes |
|---|---|---|
| Framework | **Vue 3 + Vite + TS, SPA** (decided) | Vue Router, Pinia only if needed; no SSR/Nuxt since there's no backend |
| i18n | `vue-i18n` | en, de, it (decided) |
| Licence | **AGPL-3.0** (decided) | hafas-client (ISC) code reusable; PTE (GPL) usable as reference |
| Styling | UnoCSS | dense utility styling; CSS vars for theme (npmx-like) |
| Viz | D3 (scales/shapes only) + SVG | no heavy chart lib |
| Map | MapLibre GL | open tiles, OpenRailwayMap overlay |
| Station search | Web Worker + uFuzzy / custom prefix index | |
| Offline | `vite-plugin-pwa` | precache station index + shell |
| Hosting | **zugx.legner.me**, own server, **Podman** (decided): one container (Caddy serving `dist/` + `/api/mgate` proxy) run as a systemd service via Quadlet; host Caddy in front for TLS | |
| Testing | Vitest (unit, recorded HAFAS fixtures), Playwright (e2e) | |
| CI | GitHub Actions: build image → push to `ghcr.io/<you>/zugx` (decided), server pulls via `podman auto-update`; weekly job regenerating `stations.json` + `trains-<year>.json` → PR | |

Repo layout (monorepo, pnpm):
```
apps/web            Vue SPA (pages, components, viz)
packages/hafas      typed ÖBB mgate client + normalizer, runs in browser (+ fixtures)
packages/stations   build script (Node, CI only) + committed stations.json + schema
packages/trains     train index build script (Node, CI only) + committed trains-<year>.json
packages/netz       (later) GTFS → ITF analysis → Netzgrafik model
deploy/             Containerfile (node build stage → caddy:2-alpine), Caddyfile (in-container),
                    zugx.container (Quadlet unit), Caddyfile.host (snippet for the host Caddy)
```

Sketch of `deploy/Caddyfile` (inside the container, plain HTTP on :8080):
```caddyfile
{
	admin off
	auto_https off
}

:8080 {
	encode zstd gzip

	handle /api/mgate {
		@notPost not method POST
		respond @notPost 405

		request_body {
			max_size 8KB
		}

		rewrite * /bin/mgate.exe
		reverse_proxy https://fahrplan.oebb.at {
			header_up Host {upstream_hostport}
			header_up User-Agent "zugx (https://zugx.legner.me)"
			header_up -Cookie
			header_down -Set-Cookie
		}
	}

	handle {
		root * /srv
		@hashed path /assets/*
		header @hashed Cache-Control "public, max-age=31536000, immutable"
		try_files {path} /index.html
		file_server
	}
}
```

`deploy/Caddyfile.host` (add to the existing host Caddy):
```caddyfile
zugx.legner.me {
	reverse_proxy 127.0.0.1:8080
}
```

`deploy/zugx.container` (Quadlet → `~/.config/containers/systemd/` for rootless, or `/etc/containers/systemd/`):
```ini
[Unit]
Description=zugx timetable web app

[Container]
ContainerName=zugx
Image=ghcr.io/<you>/zugx:latest
PublishPort=127.0.0.1:8080:8080
AutoUpdate=registry
ReadOnly=true
Tmpfs=/data
Tmpfs=/config

[Service]
Restart=always

[Install]
WantedBy=default.target
```
Then `systemctl --user daemon-reload && systemctl --user start zugx`. Updates: `podman auto-update` (enable `podman-auto-update.timer`) pulls new images pushed by CI. Rootless + `loginctl enable-linger` so it runs without a login session. Alternative without a registry: `podman build -t localhost/zugx -f deploy/Containerfile .` on the server and `Image=localhost/zugx`.

(Untested sketches — validate with `caddy validate` and a first deploy in M1. For local dev, Vite's `server.proxy` does the same `/api/mgate` forwarding.)
Client sends deterministic JSON (fixed key order, "now" rounded to the minute) so its own cache — and a proxy cache later — gets hits for equal searches.

---

## 7. Later: Netzgrafik for the integrierter Taktfahrplan

Reference: **Netzgrafik-Editor (NGE)** by SBB, open source since 2024 (Angular/TS frontend, Java backend), now under the OpenRail Association; has JSON import/export. SNCF's OSRD integrates it.

Approach options:
- **A. Export to NGE JSON** – derive from GTFS: for each line pattern & hour, the departure/arrival **minutes** at nodes, frequency (Takt 30/60/120), travel times between nodes; generate NGE JSON → open in the public NGE demo. Lowest effort, great validation.
- **B. Own read-only Netzgrafik renderer** – nodes = Knoten (Wien Hbf, St. Pölten, Linz, Salzburg, Graz, Villach, Innsbruck…), edges = Linien with minute labels at both ends, symmetry check (Symmetrieminute ≈ :00/:30), Knotenzeiten highlighting (Vollknoten vs Halbknoten), transfer quality at nodes.
- **C. Live-ish overlay** – colour edges by today's realtime punctuality from sampled HAFAS boards.

Data pipeline: GTFS → filter rail → cluster trips into line patterns → detect Takt per pattern/time window → compute node minutes → model. Prototype in a notebook/script first.

Note: the ÖBB "Zielnetz 2040"/Taktfahrplan Österreich planning is published as documents, not data — so the Netzgrafik would be reconstructed from the *current* timetable.

---

## 8. Train index ("Zugindex", vagonweb-style)

A browsable, searchable list of **every train running in Austria** in the current timetable year (Fahrplanjahr 2026: 14.12.2025 – 12.12.2026), in the spirit of [vagonweb.cz](https://www.vagonweb.cz/razeni/index.php?rok=2026) — but focused on Austria, for all operators, and linked into our live views.

### 8.1 Scope
- "Running in Austria" = at least one stop at an Austrian station (`81xxxxx` IDs / inside AT). Includes foreign operators on Austrian tracks (DB ICE, ČD/MÁV Railjets, SBB/FS EC, partner Nightjets, ...).
- Operators: ÖBB, WESTbahn, CAT, GKB, StH (Steiermarkbahn), SLB, Zillertalbahn, NÖVOG, Montafonerbahn, Raaberbahn (GySEV), foreign operators as above.
- Categories: RJX, RJ, NJ, EN, ICE, EC, IC, D, WB, CJX, REX, R, S, plus heritage/special trains if in the data. Buses excluded.

### 8.2 What it shows
Per train, one row (dense, sortable, like vagonweb's lists):

| Field | Example |
|---|---|
| category + number | `RJX 260` |
| name | `»Transalpin«` |
| operator | ÖBB |
| route | Wien Hbf 07:30 → … → Zürich HB 15:20 (first/last stop, with times; key intermediate stops in a tooltip/expand) |
| Verkehrstage (running days) | `täglich`, `Mo–Fr`, `nicht 24.–26.12.`, plus a small calendar heat-strip over the year |
| validity | first/last running day in the timetable year |
| links | our train run `/train/RJX-260?d=…` (live), **vagonweb composition** (§8.5) |

Quick filters (one key/chip each): **all · long-distance** (RJX, RJ, NJ, EN, ICE, EC, IC, D, WB) **· regional** (CJX, REX, R) **· S-Bahn** (S) **· night trains** (NJ, EN). Further filters: operator, category, station ("all trains stopping at Linz Hbf"), "runs on date X / today", number range, name. Grouping like vagonweb: operator → category → number. Keyboard nav as everywhere else. Typing a train number (`260`, `rjx260`, `RJX 260`) or a train name (`transalpin`) in the global search jumps straight to the train.

URLs:

| Page | URL |
|---|---|
| Index (all operators) | `/trains` (`?y=2026`, `?d=2026-11-13` = runs on that day) |
| Operator / category | `/trains/oebb`, `/trains/oebb/rjx` |
| Trains at a station | `/trains?at=8103000` |
| Single train | `/train/RJX-260` (existing train page, gains a "timetable year" tab: running days, route variants, vagonweb link) |

### 8.3 Data pipeline
- **Source: static timetable open data**, not HAFAS crawling — Austria-wide GTFS / NeTEx Sollfahrplan from mobilitydata.gv.at (covers all operators) and/or data.oebb.at. Licence and whether train numbers (`trip_short_name`) and names are included — **to verify** in M0.
- Build script `packages/trains` (Node, CI only, same pattern as `packages/stations`):
  1. Load GTFS, keep rail trips with ≥ 1 Austrian stop
  2. Group by (operator, category, number) → one train; collect route variants (different stop patterns over the year) and service days (`calendar` + `calendar_dates` → bitset over the timetable year)
  3. Map GTFS stop IDs → HAFAS IDs via `stations.json` (§4)
  4. Train names: from GTFS if present; otherwise enrich long-distance trains (a few hundred) via one HAFAS `JourneyMatch`/`JourneyDetails` each, cached and throttled
  5. Derive human-readable running days (`Mo–Fr`, `nicht 24.12.`) from the bitset
- Output, **committed** like `stations.json`: `packages/trains/trains-2026.json`, one train per line, sorted by category + number → readable diffs. Fields kept to the summary (no full stop lists); estimate ~10–15k trains → roughly 1–2 MB raw, a few hundred KB compressed. If too large: split per operator/category into separate chunks.
  ```json
  {"op":"oebb","cat":"RJX","nr":260,"name":"Transalpin","from":["8103000","07:30"],"to":["8503000","15:20"],"via":["8100013","8101001","8100108"],"days":"<base64 bitset>","text":"täglich"}
  ```
  (Illustrative.) Running days are a 365/366-bit set → ~62 chars base64 per train.
- The full stop list for a train comes **live** from HAFAS (`JourneyMatch` by number + date → `JourneyDetails`) when the train page opens — no need to ship it statically.
- Weekly CI job opens a PR on changes (like stations). At the timetable change in December, a new `trains-<year>.json` is added; the previous year is kept for a while (`?y=2025`), since the new timetable is usually published weeks before it starts.
- The index is a lazy, content-hashed chunk loaded only on `/trains*` pages and for train-number search; filtering/search runs in the same Web Worker as the station search.

### 8.4 Later extensions
- Composition ("Wagenreihung"): whether ÖBB exposes planned/actual composition via HAFAS or another endpoint — **to verify**; if so, show it on the train page. Until then, link to vagonweb.
- Diff between timetable years ("what changed in Fahrplan 2027": new/removed trains, new names, changed routes).
- Train-number ranges reference (ÖBB numbering scheme by category/region).

### 8.5 Link to vagonweb
vagonweb.cz is the reference for train compositions (Řazení vlaků); we **link to it, never scrape it** (it returns 403 to automated clients, and the composition data is their community's work).
- Single train: `https://www.vagonweb.cz/razeni/vlak.php?zeme=<op>&kategorie=<cat>&cislo=<nr>&nazev=&rok=<year>&lang=de`
- Operator/category list: `https://www.vagonweb.cz/razeni/razeni.php?zeme=<op>&kategorie=<cat>&rok=<year>&lang=de`
- `rok` = timetable year (vagonweb's 2026 = 14.12.2025 – 12.12.2026, same as ours).
- Operator codes (`zeme`) seen on vagonweb for Austria: `ÖBB`, `WSTBA` (WESTbahn, category `WEST`), `CAT`, `SLB`, `StB`, `ZB`, `NÖVOG`, `ÖGEG`, `A-` (other operators); foreign ones e.g. `ČD`, `DB`, `MÁV`, `SBB`. Their ÖBB categories: RJX, RJ, ICE, EC, NJ, EN, IC, D, IR, CJX, REX, R, SB (= S-Bahn), ASTB.
- Keep a small mapping table `vagonwebOperator(op)` / `vagonwebCategory(cat)` (e.g. our `S` → `SB`, our `WB` → `WEST`) with unit tests. The `cislo` form was only seen for non-Austrian trains (vagonweb also uses `?id=` internally) — **verify by hand** in a browser that it resolves for ÖBB trains; if not, fall back to linking the operator/category list.
- Link shown on: train page, each row in the train index, journey legs (small "Wagenreihung ↗" link).

---

## 9. Milestones

- **M0 – Spike (1–2 days):** script calling `LocMatch`, `TripSearch`, `StationBoard`, `JourneyDetails`; record fixtures; confirm current `ver`/client values work.
- **M1 – Skeleton:** Vite/Vue SPA, theme, layout, `/` search, Podman/Quadlet container (Caddy) with `/api/mgate` proxy, live on zugx.legner.me, client-side request cache, station board page, **raw JSON view** toggle (request + response, from day 1 — doubles as debug tool).
- **M2 – Station index:** build script + client worker search + PWA caching.
- **M3 – Journeys:** search form, results table + **timeline strips**, earlier/later paging, permalinks via `ctxRecon`.
- **M4 – Detail, realtime & map:** Zuglauf, remarks/HIM, auto-refresh, **map + live radar** (`JourneyGeoPos`).
- **M5 – Train index:** GTFS → `trains-<year>.json` build + weekly PR, `/trains` pages, train-number search, vagonweb links.
- **M6 – Bildfahrplan** for corridors (Westbahn, Südbahn first), keyboard command palette (`Ctrl+K`), compare connections.
- **M7 – Netzgrafik:** GTFS → NGE JSON export, then own renderer.

---

## 10. Risks
- Unofficial API: blocking / AID changes → adapter layer, caching, monitoring job that pings key methods daily.
- Legal/ToS of scraping HAFAS → keep traffic low, consider contacting ÖBB (opendata@oebb.at); prefer open data where possible.
- Station ID mismatch between GTFS and HAFAS → mapping table, verified by `LocMatch`.
- Train numbers/names missing or inconsistent in GTFS → HAFAS enrichment, manual overrides file.
- Realtime data only via HAFAS (no public GTFS-RT for ÖBB that I'm aware of — to verify).

---

## 11. Decisions
- Station index: **rail only, Austria** (≈1–2k stations; LocMatch fallback for everything else), built from **open data GTFS/NeTEx, mapped to HAFAS IDs** via `LocMatch`
- Stack: **Vue 3 SPA**, no app backend — only a **Caddy** reverse proxy to the ÖBB API
- Name: **zugx**, hosted at **zugx.legner.me**
- Hosting: **own server, Podman** (Quadlet systemd service), host Caddy for TLS
- Station cache: **committed `stations.json`**, refreshed by a weekly CI PR
- First geek features: **timeline strips, Bildfahrplan, map + live radar, raw API JSON view** (all four)
- UI language: **en + de + it**, i18n from day 1
- Images: **GitHub Actions → GHCR**, `podman auto-update` on the server
- Licence: **AGPL-3.0**
- Netzgrafik: **export to NGE JSON first** (option A), own renderer later
- Layout: **responsive, desktop-dense**
- Prices: **ignored** (at most a link to the ÖBB ticket shop)
- Delay history/statistics: **out of scope for now**, idea kept for later (would need a sampling service + DB)
- Train index: **all trains** incl. regional/S-Bahn, with quick filters (long-distance / regional / S-Bahn / night); source **open data GTFS/NeTEx**, HAFAS only to enrich names

## 12. Open questions

None right now — all answered (see §11). Still **to verify** in M0: open data licence and whether train numbers/names are in the GTFS, vagonweb `cislo` links for ÖBB trains, ÖBB composition data, Souin caching on POST bodies.

---

## Sources
- public-transport-enabler `OebbProvider` (via javatips mirror): https://www.javatips.net/api/Advanced-Public-Transport-Timetables-master/app/de/schildbach/pte/OebbProvider.java
- KDE KPublicTransport ÖBB network config: https://autoconfig.kde.org/kpublictransport/networks/at_oebb-26.04.0.json
- hafas-client ÖBB profile: https://cdn.jsdelivr.net/npm/hafas-client@6.3.6/p/oebb/readme.md
- hafas-client readme: https://cdn.jsdelivr.net/npm/hafas-client@6.3.6/readme.md
- ÖBB Scotty mgate API notes (agent skill): https://tessl.io/registry/skills/github/mitsuhiko/agent-stuff/oebb-scotty
- ÖBB open data portal: https://data.oebb.at/
- vagonweb.cz train compositions (index 2026): https://www.vagonweb.cz/razeni/index.php?rok=2026
- Austrian open transport data (national access point): https://mobilitydata.gv.at/
- npmx.dev repo: https://github.com/npmx-dev/npmx.dev
- Netzgrafik-Editor: https://github.com/OpenRailAssociation/netzgrafik-editor-frontend
- FOSDEM 2025 NGE talk: https://fosdem.org/schedule/event/fosdem-2025-5023-netzgrafik-editor-a-human-centric-timetable-planning-approach
