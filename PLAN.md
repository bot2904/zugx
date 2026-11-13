# zugx — a geeky ÖBB timetable web app

**https://zugx.legner.me**

> A fast, mobile-friendly, information-dense timetable browser for Austrian (and neighbouring) public transport.
> Scotty's data, npmx.dev's feel. Later: Netzgrafik views of the Austrian integrated interval timetable (ITF / Taktfahrplan).

Status: **M0–M7 implemented (2026-11-13)**, not yet deployed. Implementation notes and deviations in §13.

Name: **zugx** (decided).

Considered names (German railway terms):

| Name         | Meaning                                                                        |
| ------------ | ------------------------------------------------------------------------------ |
| Kursbuch     | printed book of all timetables; ÖBB still publishes one per timetable period   |
| Bildfahrplan | time–distance diagram (graphic timetable)                                      |
| Perron       | old Austrian/Swiss word for platform (Bahnsteig)                               |
| Buchfahrplan | the train driver's timetable for one train                                     |
| Taktknoten   | node station where trains meet on the hour in an integrated interval timetable |
| Kondukteur   | old Austrian word for conductor                                                |
| Stellwerk    | signal box; already used by many products and games                            |
| Drehscheibe  | turntable; clashes with the "Drehscheibe Online" railway fan forum             |

---

## 1. Goals / non-goals

**Goals**

- Journey search A → B (via, date/time, dep/arr, products filter, min. transfer time)
- Station boards (departures / arrivals) with realtime delays, platforms, cancellations
- Train detail ("Zuglauf"): all stops, times, delays, platform, composition if available
- Disruption info (HIM messages)
- **Train index**: every train running in Austria this timetable year, vagonweb-style (see §8); links to vagonweb compositions later (§8.5)
- **Instant station search** from a local, pre-built station index (no network round trip per keystroke)
- **Excellent visualization** of found connections (see §5)
- Shareable, permalink-style URLs for everything
- Fast and mobile-friendly first; keyboard shortcuts on desktop as a bonus (`/` to focus search, arrow keys, `j/k`, shortcuts for earlier/later)
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

| Page                        | URL                                                               |
| --------------------------- | ----------------------------------------------------------------- |
| Home / search               | `/`                                                               |
| Station search              | `/s?q=wien`                                                       |
| Station board               | `/station/8103000` (`?arr`, `?t=2026-11-13T12:00`, `?products=…`) |
| Journey search              | `/j/8103000/8100002?t=…&via=…&dep`                                |
| Journey detail (one result) | `/j/…/#3` or `/trip/<recon-token>`                                |
| Train run                   | `/train/<journeyId>` and friendly `/train/RJX-260?d=2026-11-13`   |
| Disruptions                 | `/him`                                                            |
| Train index                 | `/trains` (see §8)                                                |
| Netzgrafik (later)          | `/netz/<region>`                                                  |

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

| Method                           | Use                                                                           |
| -------------------------------- | ----------------------------------------------------------------------------- |
| `LocMatch`                       | station/address/POI search (fallback when local index misses, addresses/POIs) |
| `LocGeoPos`                      | nearby stations                                                               |
| `TripSearch`                     | journeys; `outCtxScrF`/`outCtxScrB` context tokens for "earlier/later" paging |
| `Reconstruction`                 | refresh a journey by its `ctxRecon` token (permalinks, live updates)          |
| `StationBoard`                   | departures/arrivals (`type: DEP/ARR`)                                         |
| `JourneyDetails`                 | full train run incl. stops, remarks, polyline                                 |
| `JourneyGeoPos` / `JourneyMatch` | live train positions ("radar") / find train by number                         |
| `HimSearch`                      | disruptions                                                                   |

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
             └─► 127.0.0.1:9849  podman container "zugx" (Caddy, HTTP only)
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

- **data.oebb.at** – ÖBB open data portal (checked 2026-11-13):
  - [GTFS Fahrplan ÖBB 2026](https://data.oebb.at/de/datensaetze~soll-fahrplan-gtfs~): static GTFS ZIP, valid 14.12.2025 – 12.12.2026, updated yearly, **CC BY 4.0**, download after accepting terms (no API key). Covers **ÖBB-Personenverkehr, CAT, Montafonerbahn only** — not WESTbahn, GKB, StH, …
  - [NeTEx 2026 (EU 2024/490 / MMTIS)](https://data.oebb.at/de/datensaetze~datenbereitstellung_delegierte_verordnung_eu_2024-490~) by ÖBB-Infrastruktur, CC BY 3.0 AT ("Datenquelle: ÖBB-Infrastruktur AG").
  - **"Zugfahrten" CSV** (same page; also on mobilitydata.gv.at as "Zugfahrten" and "Verspätungen von Zugfahrten"): planned **and actual** times of train runs incl. cancellations, updated at least weekly. Not live, but the ready-made basis for **delay statistics later** (§11) — no sampling service needed.
  - Use for the **station index**, the **train index**, and later **Netzgrafik/ITF analysis** (static schedule).
- **mobilitydata.gv.at** (national access point): Austria-wide "Soll-Fahrplandaten (GTFS)" / "(NeTEx)" for **all operators** → preferred source for the train index (§8) since the ÖBB GTFS misses other operators. Licence, coverage and train numbers — to verify in M0.
- **Realtime: no open GTFS-RT / SIRI / VDV feed for Austrian rail exists** (checked 2026-11-13: data.oebb.at, mobilitydata.gv.at "Echtzeit" filter, MobilityDatabase). The FFG project **SIRI4AT** (06/2026 – 11/2027) is building an Austrian SIRI profile with open-source converters incl. to GTFS-RT → watch it; until then **realtime only via HAFAS**.
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
{
  "id": "8103000",
  "name": "Wien Hbf",
  "lat": 48.185184,
  "lon": 16.376413,
  "p": ["RJX", "RJ", "NJ", "EC", "REX", "R", "S"],
  "w": 1000,
  "alias": ["Wien Hauptbahnhof"]
}
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

| Concern        | Choice                                                                                                                                                                                                         | Notes                                                                         |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Framework      | **Vue 3 + Vite + TS, SPA** (decided)                                                                                                                                                                           | Vue Router, Pinia only if needed; no SSR/Nuxt since there's no backend        |
| i18n           | `vue-i18n`                                                                                                                                                                                                     | en, de, it (decided)                                                          |
| Licence        | **AGPL-3.0** (decided)                                                                                                                                                                                         | hafas-client (ISC) code reusable; PTE (GPL) usable as reference               |
| Styling        | UnoCSS                                                                                                                                                                                                         | dense utility styling; CSS vars for theme (npmx-like)                         |
| Viz            | D3 (scales/shapes only) + SVG                                                                                                                                                                                  | no heavy chart lib                                                            |
| Map            | MapLibre GL                                                                                                                                                                                                    | open tiles, OpenRailwayMap overlay                                            |
| Station search | Web Worker + uFuzzy / custom prefix index                                                                                                                                                                      |                                                                               |
| Offline        | `vite-plugin-pwa`                                                                                                                                                                                              | precache station index + shell                                                |
| Hosting        | **zugx.legner.me**, own server, **Podman** (decided): one container (Caddy serving `dist/` + `/api/mgate` proxy) run as a systemd service via Quadlet; host Caddy in front for TLS                             |                                                                               |
| Toolchain      | **Vite+ (`vite-plus`, latest — 1.6.0 as of 2026-11) + pnpm (latest — 12.18.0)** (decided)                                                                                                                      | one `vp` CLI for dev/build/test/lint/fmt/typecheck/pack/tasks/hooks, see §6.1 |
| Testing        | Vitest via `vp test` (unit, recorded HAFAS fixtures), Playwright (e2e)                                                                                                                                         |                                                                               |
| CI             | GitHub Actions: build image → push to `ghcr.io/simon04/zugx` (decided), server pulls via `podman auto-update`; weekly job regenerating `stations.json` + `trains-<year>.json` / `trains-<year>.full.json` → PR |                                                                               |

Repo layout (monorepo, pnpm workspace, Vite+):

```
apps/web            Vue SPA (pages, components, viz)
packages/hafas      typed ÖBB mgate client + normalizer, runs in browser (+ fixtures)
packages/stations   build script (Node, CI only) + committed stations.json + schema
packages/trains     train index build script (Node, CI only) + committed trains-<year>.json (default, long-distance) + trains-<year>.full.json (all)
packages/netz       (later) GTFS → ITF analysis → Netzgrafik model
deploy/             Containerfile (node build stage → caddy:2-alpine), Caddyfile (in-container),
                    zugx.container (Quadlet unit), Caddyfile.host (snippet for the host Caddy)
```

### 6.1 Tooling: full Vite+ with pnpm (decided)

Use **all of Vite+** (VoidZero's unified toolchain, https://viteplus.dev) — no separate ESLint/Prettier/Husky/lint-staged/Turbo/tsup:

| Concern                                   | Vite+ command                                              | Wraps             |
| ----------------------------------------- | ---------------------------------------------------------- | ----------------- |
| dev server / build / preview (`apps/web`) | `vp dev`, `vp build`, `vp preview`                         | Vite (Rolldown)   |
| unit tests                                | `vp test`                                                  | Vitest            |
| lint (type-aware)                         | `vp lint`                                                  | Oxlint + tsgolint |
| format                                    | `vp fmt`                                                   | Oxfmt             |
| all checks (fmt + lint + types)           | `vp check` (`--fix` locally)                               |                   |
| library builds (`packages/hafas`)         | `vp pack`                                                  | tsdown            |
| monorepo tasks with caching               | `vp run -r build`, `vp run --filter …`                     | Vite Task         |
| git hooks                                 | `vp config` → `.vite-hooks/pre-commit` running `vp staged` | lint-staged       |
| deps                                      | `vp install`, `vp add`, `vp outdated` → pnpm               |                   |
| Node + pnpm versions                      | global `vp` (`vp env`)                                     |                   |

- Always use the **latest** `vite-plus` and **pnpm**: `packageManager: "pnpm@<latest>"` in the root `package.json`, Node 24 LTS in `.node-version`; Renovate (or Dependabot) keeps `vite-plus`, pnpm and `voidzero-dev/setup-vp` current.
- Scaffold with `vp create` (Vue template, monorepo) in M1 rather than hand-writing configs.
- **One root `vite.config.ts`** holds shared `lint`, `check`, `staged` and `run.tasks`; **formatting uses Oxfmt defaults** (no `fmt` block, decided); per-package overrides via `overrides` in the root config (Vite+ recommends against package-level lint/fmt blocks). `apps/web/vite.config.ts` only has app-specific Vite config (Vue plugin, PWA, UnoCSS, `server.proxy` for `/api/mgate`).
  ```ts
  // vite.config.ts (root) — sketch
  import { defineConfig } from "vite-plus";
  export default defineConfig({
    defaultPackage: { dev: "./apps/web", build: "./apps/web" },
    lint: { plugins: ["typescript", "vue"], options: { typeAware: true, typeCheck: true } },
    staged: { "*": "vp check --fix" },
    run: {
      tasks: {
        "stations:build": { command: "node packages/stations/build.ts", cache: false },
        "trains:build": { command: "node packages/trains/build.ts", cache: false },
      },
    },
  });
  ```
  (Untested; exact keys checked against the docs when scaffolding.)
- **CI**: `voidzero-dev/setup-vp@<pinned release>` (v1.22.0 as of 2026-11; pin an exact tag/SHA, not `v1`) with `cache: true`, then `vp check`, `vp test`, `vp build`; plus the Vite Task GitHub Actions cache. Containerfile build stage uses the same: install `vite-plus`, `vp install --frozen-lockfile`, `vp build`.
- **To verify in M1 (Vue)**: how well Oxlint/tsgolint and Oxfmt handle `.vue` SFCs (template + `<script setup lang="ts">`). If type checks don't cover SFCs, add a `vue-tsc --noEmit` task to `vp run` and CI; if Oxfmt can't format `.vue` yet, accept that until it can.

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
			header_up Host fahrplan.oebb.at
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
	reverse_proxy 127.0.0.1:9849
}
```

`deploy/zugx.container` (Quadlet → `~/.config/containers/systemd/` for rootless, or `/etc/containers/systemd/`):

```ini
[Unit]
Description=zugx timetable web app

[Container]
ContainerName=zugx
Image=ghcr.io/simon04/zugx:latest
PublishPort=127.0.0.1:9849:8080
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

(Untested sketches — validate with `caddy validate` and a first deploy in M1. For local dev (`vp dev`), Vite's `server.proxy` does the same `/api/mgate` forwarding.)
Client sends deterministic JSON (fixed key order, "now" rounded to the minute) so its own cache — and a proxy cache later — gets hits for equal searches.

---

## 7. Later: Netzgrafik for the integrierter Taktfahrplan

Reference: **Netzgrafik-Editor (NGE)** by SBB, open source since 2024 (Angular/TS frontend, Java backend), now under the OpenRail Association; has JSON import/export. SNCF's OSRD integrates it.

Approach options:

- **A. Export to NGE JSON** – derive from GTFS: for each line pattern & hour, the departure/arrival **minutes** at nodes, frequency (Takt 30/60/120), travel times between nodes; generate NGE JSON → open in the public NGE demo. Lowest effort, great validation.
- **B. Own read-only Netzgrafik renderer** – nodes = Knoten (Wien Hbf, St. Pölten, Linz, Salzburg, Graz, Villach, Innsbruck…), edges = Linien with minute labels at both ends, symmetry check (Symmetrieminute ≈ :00/:30), Knotenzeiten highlighting (Vollknoten vs Halbknoten), transfer quality at nodes.
- **C. Live-ish overlay** – colour edges by today's realtime punctuality from sampled HAFAS boards.

Data pipeline: GTFS → filter rail → cluster trips into line patterns → detect Takt per pattern/time window → compute node minutes → model. Prototype in a notebook/script first.

Note: the ÖBB "Zielnetz 2040"/Taktfahrplan Österreich planning is published as documents, not data — so the Netzgrafik would be reconstructed from the _current_ timetable.

---

## 8. Train index ("Zugindex", vagonweb-style)

A browsable, searchable list of **every train running in Austria** in the current timetable year (Fahrplanjahr 2026: 14.12.2025 – 12.12.2026), in the spirit of [vagonweb.cz](https://www.vagonweb.cz/razeni/index.php?rok=2026) — but focused on Austria, for all operators, and linked into our live views.

### 8.1 Scope

- "Running in Austria" = at least one stop at an Austrian station (`81xxxxx` IDs / inside AT). Includes foreign operators on Austrian tracks (DB ICE, ČD/MÁV Railjets, SBB/FS EC, partner Nightjets, ...).
- Operators: ÖBB, WESTbahn, CAT, GKB, StH (Steiermarkbahn), SLB, Zillertalbahn, NÖVOG, Montafonerbahn, Raaberbahn (GySEV), foreign operators as above.
- Categories: RJX, RJ, NJ, EN, ICE, EC, IC, D, WB, CJX, REX, R, S, plus heritage/special trains if in the data. Buses excluded.

### 8.2 What it shows

Per train, one row (dense, sortable, like vagonweb's lists):

| Field                       | Example                                                                                                        |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| category + number           | `RJX 260`                                                                                                      |
| name                        | `»Transalpin«`                                                                                                 |
| operator                    | ÖBB                                                                                                            |
| route                       | Wien Hbf 07:30 → … → Zürich HB 15:20 (first/last stop, with times; key intermediate stops in a tooltip/expand) |
| Verkehrstage (running days) | `täglich`, `Mo–Fr`, `nicht 24.–26.12.`, plus a small calendar heat-strip over the year                         |
| validity                    | first/last running day in the timetable year                                                                   |
| links                       | our train run `/train/RJX-260?d=…` (live), vagonweb composition (later, §8.5)                                  |

Quick filters (one key/chip each): **all · long-distance** (RJX, RJ, NJ, EN, ICE, EC, IC, D, WB) **· regional** (CJX, REX, R) **· S-Bahn** (S) — regional and S-Bahn load the full file (§8.3) **· night trains** (NJ, EN). Further filters: operator, category, station ("all trains stopping at Linz Hbf"), "runs on date X / today", number range, name. Grouping like vagonweb: operator → category → number. Keyboard nav as everywhere else. Typing a train number (`260`, `rjx260`, `RJX 260`) or a train name (`transalpin`) in the global search jumps straight to the train.

URLs:

| Page                  | URL                                                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Index (all operators) | `/trains` (`?y=2026`, `?d=2026-11-13` = runs on that day)                                                               |
| Operator / category   | `/trains/oebb`, `/trains/oebb/rjx`                                                                                      |
| Trains at a station   | `/trains?at=8103000`                                                                                                    |
| Single train          | `/train/RJX-260` (existing train page, gains a "timetable year" tab: running days, route variants; vagonweb link later) |

### 8.3 Data pipeline

- **Source: static timetable open data**, not HAFAS crawling — Austria-wide GTFS / NeTEx Sollfahrplan from mobilitydata.gv.at (covers all operators) and/or data.oebb.at. Licence and whether train numbers (`trip_short_name`) and names are included — **to verify** in M0.
- Build script `packages/trains` (Node, CI only, same pattern as `packages/stations`):
  1. Load GTFS, keep rail trips with ≥ 1 Austrian stop
  2. Group by (operator, category, number) → one train; collect route variants (different stop patterns over the year) and service days (`calendar` + `calendar_dates` → bitset over the timetable year)
  3. Map GTFS stop IDs → HAFAS IDs via `stations.json` (§4)
  4. Train names: from GTFS if present; otherwise enrich long-distance trains (a few hundred) via one HAFAS `JourneyMatch`/`JourneyDetails` each, cached and throttled
  5. Derive human-readable running days (`Mo–Fr`, `nicht 24.12.`) from the bitset
- Output, **committed** like `stations.json`, as **two files** per timetable year (decided), one train per line, sorted by category + number → readable diffs, fields kept to the summary (no full stop lists):
  - `packages/trains/trains-2026.json` — **default**: without regional trains — no R, REX, CJX, S — i.e. long-distance + night only (RJX, RJ, NJ, EN, ICE, EC, IC, D, WB, …; a few hundred to ~2k trains, tens of KB compressed)
  - `packages/trains/trains-2026.full.json` — **full**: all trains (~10–15k → roughly 1–2 MB raw, a few hundred KB compressed)
  - `trains-2026.json` is a strict subset of `trains-2026.full.json`, generated from it in the same build step; a CI check verifies this.
  ```json
  {
    "op": "oebb",
    "cat": "RJX",
    "nr": 260,
    "name": "Transalpin",
    "from": ["8103000", "07:30"],
    "to": ["8503000", "15:20"],
    "via": ["8100013", "8101001", "8100108"],
    "days": "<base64 bitset>",
    "text": "täglich"
  }
  ```
  (Illustrative.) Running days are a 365/366-bit set → ~62 chars base64 per train.
- The full stop list for a train comes **live** from HAFAS (`JourneyMatch` by number + date → `JourneyDetails`) when the train page opens — no need to ship it statically.
- Weekly CI job opens a PR on changes (like stations). At the timetable change in December, new `trains-<year>.json` + `trains-<year>.full.json` are added; the previous year is kept for a while (`?y=2025`), since the new timetable is usually published weeks before it starts.
- Both files are lazy, content-hashed chunks, loaded only on `/trains*` pages and for train-number search; filtering/search runs in the same Web Worker as the station search.
- **`trains-<year>.json` loads by default.** `trains-<year>.full.json` is loaded on demand: when the regional/S-Bahn quick filter is picked, a regional category or `?all` is in the URL, a station filter is set, or a train-number search misses in the default file. Once the full file is loaded, it replaces the default one for the rest of the session (the service worker caches both).

### 8.4 Later extensions

- Composition ("Wagenreihung"): whether ÖBB exposes planned/actual composition via HAFAS or another endpoint — **to verify**; if so, show it on the train page. Otherwise link to vagonweb (§8.5).
- Diff between timetable years ("what changed in Fahrplan 2027": new/removed trains, new names, changed routes).
- Train-number ranges reference (ÖBB numbering scheme by category/region).

### 8.5 Link to vagonweb (later — decided: not part of M5)

vagonweb.cz is the reference for train compositions (Řazení vlaků); we **link to it, never scrape it** (it returns 403 to automated clients, and the composition data is their community's work).

- Single train: `https://www.vagonweb.cz/razeni/vlak.php?zeme=<op>&kategorie=<cat>&cislo=<nr>&nazev=&rok=<year>&lang=de`
- Operator/category list: `https://www.vagonweb.cz/razeni/razeni.php?zeme=<op>&kategorie=<cat>&rok=<year>&lang=de`
- `rok` = timetable year (vagonweb's 2026 = 14.12.2025 – 12.12.2026, same as ours).
- Operator codes (`zeme`) seen on vagonweb for Austria: `ÖBB`, `WSTBA` (WESTbahn, category `WEST`), `CAT`, `SLB`, `StB`, `ZB`, `NÖVOG`, `ÖGEG`, `A-` (other operators); foreign ones e.g. `ČD`, `DB`, `MÁV`, `SBB`. Their ÖBB categories: RJX, RJ, ICE, EC, NJ, EN, IC, D, IR, CJX, REX, R, SB (= S-Bahn), ASTB.
- Keep a small mapping table `vagonwebOperator(op)` / `vagonwebCategory(cat)` (e.g. our `S` → `SB`, our `WB` → `WEST`) with unit tests. The `cislo` form was only seen for non-Austrian trains (vagonweb also uses `?id=` internally) — **verify by hand** in a browser that it resolves for ÖBB trains; if not, fall back to linking the operator/category list.
- Before building it: verify by hand that `cislo` links resolve for ÖBB trains.
- Link shown on: train page, each row in the train index, journey legs (small "Wagenreihung ↗" link).

---

## 9. Milestones

- **M0 – Spike (1–2 days):** script calling `LocMatch`, `TripSearch`, `StationBoard`, `JourneyDetails`; record fixtures; confirm current `ver`/client values work.
- **M1 – Skeleton:** Vite/Vue SPA, theme, layout, `/` search, Podman/Quadlet container (Caddy) with `/api/mgate` proxy, live on zugx.legner.me, client-side request cache, station board page, **raw JSON view** toggle (request + response, from day 1 — doubles as debug tool).
- **M2 – Station index:** build script + client worker search + PWA caching.
- **M3 – Journeys:** search form, results table + **timeline strips**, earlier/later paging, permalinks via `ctxRecon`.
- **M4 – Detail, realtime & map:** Zuglauf, remarks/HIM, auto-refresh, **map + live radar** (`JourneyGeoPos`).
- **M5 – Train index:** GTFS → `trains-<year>.json` + `trains-<year>.full.json` build + weekly PR, `/trains` pages, train-number search.
- **Later (after M5, no fixed slot):** vagonweb links (§8.5).
- **M6 – Bildfahrplan** for corridors (Westbahn, Südbahn first), keyboard command palette (`Ctrl+K`), compare connections.
- **M7 – Netzgrafik:** GTFS → NGE JSON export, then own renderer.

---

## 10. Risks

- Unofficial API: blocking / AID changes → adapter layer, caching, monitoring job that pings key methods daily.
- Legal/ToS of scraping HAFAS → keep traffic low, consider contacting ÖBB (opendata@oebb.at); prefer open data where possible.
- Station ID mismatch between GTFS and HAFAS → mapping table, verified by `LocMatch`.
- Train numbers/names missing or inconsistent in GTFS → HAFAS enrichment, manual overrides file.
- Realtime data only via HAFAS: confirmed, there is no open GTFS-RT/SIRI feed for Austrian rail (2026-11); SIRI4AT may change that from late 2027.

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
- vagonweb links: **later**, not part of the first train index (M5)
- Netzgrafik: **export to NGE JSON first** (option A), own renderer later
- Layout: **responsive, desktop-dense**
- Prices: **ignored** (at most a link to the ÖBB ticket shop)
- Delay history/statistics: **out of scope for now**, idea kept for later — ÖBB's weekly "Zugfahrten" CSV (planned + actual times) could feed it without a sampling service
- Tooling: **full Vite+ (latest) + pnpm (latest)**, no separate ESLint/Prettier/Husky/Turbo
- Train index: **all trains** incl. regional/S-Bahn, with quick filters (long-distance / regional / S-Bahn / night); source **open data GTFS/NeTEx**, HAFAS only to enrich names

## 12. Open questions

None right now — all answered (see §11). Still **to verify** in M0: open data licence and whether train numbers/names are in the GTFS, ÖBB composition data, Souin caching on POST bodies.

---

## 13. Implementation status & findings (2026-11-13)

All milestones M0–M7 are implemented on `master`; `vp check`, unit tests (hafas, gtfs, stations, trains, netz, web), `vue-tsc` and 22 Playwright e2e tests (desktop + mobile, API mocked from fixtures) pass; the container image was built and verified locally (SPA + live `/api/mgate`). **Not done:** deploying to zugx.legner.me (needs the GHCR owner in `deploy/zugx.container` and the host Caddy snippet), running CI on GitHub (no remote yet).

Findings from the API and data, and deviations from the plan:

- **mgate:** `ver 1.67` + `vs_webapp` client works for all methods. Reconstruction takes `outReconL: [{ ctx }]` (from `con.recon.ctx`), not `ctxRecon`. HAFAS rejects any `Host` other than exactly `fahrplan.oebb.at` (Caddy sets it explicitly and drops `X-Forwarded-*`). TripSearch takes ~3–5 s.
- **Product classes:** `cls 2` is rail replacement (SEV/Bsv), **not** night trains — NJ/EN come as `cls 8` and are detected by category. Boards default to rail classes only (the Wien Hbf meta-station otherwise lists trams/buses).
- **Train names** (e.g. »Transalpin«) are not in the GTFS; HAFAS has them as a remark with code `ZN` in `JourneyMatch` (cached in `packages/trains/data/names-<year>.json`).
- **Open data:** the ÖBB GTFS (CC BY 4.0) is freely downloadable and has train numbers in `trip_short_name`, but covers only ÖBB-PV, CAT and Montafonerbahn; the Austria-wide GTFS on mobilitydata.gv.at needs registration and a licence agreement, so it is not used (builds accept `GTFS_ZIP=` to merge more feeds later). It is the December snapshot, so mid-year changes are missing, and foreign termini are cut at ÖBB's part of the run.
- **Data built:** 1016 stations (1142/1146 GTFS stations mapped to HAFAS ids), train index 715 default / 7938 full trains (16 KB / 113 KB gzip), Netzgrafik 44 nodes / 63 lines (+ NGE export, not yet test-imported into NGE), 4 Bildfahrplan corridors (Westbahn, Südbahn, Koralmbahn, Brenner).
- **Station search** runs on the main thread (2–5 ms for 1k stations), no Web Worker needed. Extra package `packages/gtfs` holds shared GTFS/CSV/zip/HAFAS-throttling code.
- **Type checking:** tsgolint (TypeScript 7) can't read `.vue` files, so the web app additionally runs `vue-tsc` (pinned to TypeScript 6 in `apps/web`, since TS 7 has no JS API yet) via `vp run -r typecheck`.
- **Running-days bitsets** are MSB-first per byte (like HAFAS `sDaysB`).

## 14. Later: custom station plans from OpenRailwayMap vector tiles

Station pages show a minimap with OSM Carto raster tiles (zoom 17–19: station building, platforms with numbers, entrances, lifts). A custom, calmer rendering would be nicer:

- **OpenRailwayMap-vector** (github.com/hiddewie/OpenRailwayMap-vector, live at openrailwaymap.app) has exactly the needed vector layers: `standard_railway_platforms`, `standard_railway_platform_edges`, `standard_station_entrances`, `standard_railway_stop_positions`, `standard_railway_grouped_station_areas`, `railway_line_high` (tracks), switches, signals. Its style is at `https://openrailwaymap.app/style.json` (TileJSON sources such as `/standard_railway_platforms,standard_railway_platform_edges`).
- **Blocker:** the tile endpoints answer `403 Forbidden` to other sites (referer-restricted). Do **not** work around that.
- **Options:**
  1. Ask the maintainer (issue on hiddewie/OpenRailwayMap-vector) whether zugx.legner.me may use the tiles.
  2. Self-host for Austria: the project is open source (osm2pgsql + PostGIS + Martin tile server); an Austria extract is small enough for a container next to zugx, plus a weekly OSM update.
- Overpass (live queries for platforms/entrances) was considered and rejected: too slow and unreliable.

## 15. modern-web-guidance pass (2026-11-13)

Working through https://github.com/GoogleChrome/modern-web-guidance (clone in `modern-web-guidance/`, local only, never commit). One commit per guide; done so far: dark-mode(-toggle)/browser-ui-theming, dialog (+ light dismiss, no scroll under modal), sortable-table, accessibility + respect-os-text-scale, ime-safe-enter-submit, deprioritize-background-fetches, defer-rendering-heavy-content, same-document-transitions, install-web-app (+ smaller SW precache), security/trusted-types headers, typography/scrollbar-color, forms (`<search>`, type=search, enterkeyhint), copy-button, state-aware-sticky-headers + scrollability-affordance-hints.

Still to do:

- ~~Flaky e2e test~~ fixed: a stale async `close` event closed a quickly reopened `<dialog>`.
- Also done: navbar (popover menu when the links don't fit), break-up-long-tasks (train index filter), color/contrast (badges ≥ 4.5:1). `legacy-scan` now reports 0 findings.
- Checked, deliberately not changed: responsive-table (tables already fit on phones by hiding secondary columns; a scroll wrapper would break the page-level sticky headers), visually-stable-font-fallbacks (no web fonts are loaded).
- Still open (low priority): interest-triggered-tooltips (some info only in `title`, e.g. running-days details — `interestfor` has limited browser support), scroll-target-on-load (`/j/…#3` could scroll the expanded connection into view), container queries for the board + station-map layout.

### Adopt VueUse

- Replace hand-rolled composables with [VueUse](https://vueuse.org/) where it simplifies code: `useLocalStorage` (store, theme override, delay palette, ORM toggle, station-map open state), `useIntervalFn` + `useDocumentVisibility` (board/radar/train auto-refresh), `useEventListener` / `onKeyStroke` (`lib/keys.ts`), `useMediaQuery` / `usePreferredDark` (theme), `useResizeObserver` (TimelineStrips, MapView), `useClipboard` (copy link), `useDebounceFn` (filters), `useGeolocation` (near me).
- Tree-shakeable; check bundle size before/after, keep behaviour identical (e2e tests).

### Vue lint pass (eslint-plugin-vue "recommended")

- Goal: catch Vue-specific issues (prop/emit typing, `v-for` keys, `v-if`+`v-for`, mutating props, template naming/order, a11y-ish template rules) that tsgolint + vue-tsc don't.
- Approach, in this order:
  1. Enable all of Oxlint's built-in `vue/*` rules (already `plugins: ["typescript", "vue"]` in `vite.config.ts`) — Oxlint ports a subset of eslint-plugin-vue; turn on the ones matching the "recommended" preset and fix findings.
  2. Try `lint.jsPlugins` (Oxlint JS plugins, used e.g. in bldrwnsch) with `eslint-plugin-vue` for the rules Oxlint lacks — only if it understands `.vue` SFCs; otherwise skip (no separate ESLint setup, per §6.1).
  3. For what's still uncovered: read the eslint-plugin-vue rules list (https://eslint.vuejs.org/rules/) for `essential` / `strongly-recommended` / `recommended` and fix by inspecting the ~30 components by hand.

## Sources

- public-transport-enabler `OebbProvider` (via javatips mirror): https://www.javatips.net/api/Advanced-Public-Transport-Timetables-master/app/de/schildbach/pte/OebbProvider.java
- KDE KPublicTransport ÖBB network config: https://autoconfig.kde.org/kpublictransport/networks/at_oebb-26.04.0.json
- hafas-client ÖBB profile: https://cdn.jsdelivr.net/npm/hafas-client@6.3.6/p/oebb/readme.md
- hafas-client readme: https://cdn.jsdelivr.net/npm/hafas-client@6.3.6/readme.md
- ÖBB Scotty mgate API notes (agent skill): https://tessl.io/registry/skills/github/mitsuhiko/agent-stuff/oebb-scotty
- ÖBB open data portal: https://data.oebb.at/
- Vite+ docs: https://viteplus.dev/guide (config: https://viteplus.dev/config/, CI: https://viteplus.dev/guide/ci)
- vagonweb.cz train compositions (index 2026): https://www.vagonweb.cz/razeni/index.php?rok=2026
- Austrian open transport data (national access point): https://mobilitydata.gv.at/ (realtime filter: https://mobilitydata.gv.at/daten?filter=122)
- ÖBB GTFS 2026: https://data.oebb.at/de/datensaetze~soll-fahrplan-gtfs~
- ÖBB NeTEx + Zugfahrten CSV: https://data.oebb.at/de/datensaetze~datenbereitstellung_delegierte_verordnung_eu_2024-490~
- SIRI4AT (FFG project, Austrian SIRI profile): https://projekte.ffg.at/projekt/cd1b483e-f36b-1410-8654-00d3c07d99bb
- npmx.dev repo: https://github.com/npmx-dev/npmx.dev
- Netzgrafik-Editor: https://github.com/OpenRailAssociation/netzgrafik-editor-frontend
- FOSDEM 2025 NGE talk: https://fosdem.org/schedule/event/fosdem-2025-5023-netzgrafik-editor-a-human-centric-timetable-planning-approach
