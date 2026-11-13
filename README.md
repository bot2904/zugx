# zugx

Fast, keyboard-first, information-dense timetable browser for Austrian trains — **https://zugx.legner.me**

- Station boards with realtime delays, platforms, cancellations
- Journey search with **timeline strips**, table view, earlier/later paging, compare, "what if I miss it?"
- Train runs (Zuglauf) with delay profile and map; friendly URLs like `/train/RJX-162?d=2026-11-13`
- **Live radar** of train positions
- **Train index** of every train running in Austria in the timetable year (`/trains`)
- **Bildfahrplan** (time–distance diagrams) for corridors, **Netzgrafik** of the integrated interval timetable (+ export for SBB's Netzgrafik-Editor)
- Raw API JSON view (`d`), command palette (`Ctrl/⌘ K`), UI in English, German, Italian

See [PLAN.md](PLAN.md) for the design and decisions.

## Layout

```
apps/web            Vue 3 SPA (pages, components, viz)
packages/hafas      typed ÖBB HAFAS mgate client + normalizer (+ recorded fixtures)
packages/stations   station index build (ÖBB GTFS → HAFAS IDs) + committed stations.json
packages/trains     train index build (ÖBB GTFS) + committed trains-<year>.json / .full.json
packages/netz       Netzgrafik / Bildfahrplan build (ÖBB GTFS) + committed data
e2e                 Playwright smoke tests (API mocked from fixtures)
deploy              Containerfile, Caddyfile, Quadlet unit, host Caddy snippet
```

## Development

Tooling is [Vite+](https://viteplus.dev) (`vp`) with pnpm.

```sh
pnpm install
vp run dev                  # SPA on :5173, /api/mgate proxied to ÖBB
vp check                    # format, lint, type check (+ vp run -r typecheck for .vue files)
vp run -r test              # unit tests
vp run --filter @zugx/e2e e2e
vp run stations:build       # rebuild station index (downloads ÖBB GTFS, queries HAFAS)
vp run trains:build         # rebuild train index
vp run netz:build           # rebuild Netzgrafik + corridors
vp run hafas:record         # re-record API fixtures
vp run hafas:canary         # check the live API still works
```

## Deployment

One container (Caddy serving `dist/` + a strict `/api/mgate` reverse proxy to ÖBB), run via Podman Quadlet behind the host Caddy:

```sh
podman build -t localhost/zugx -f deploy/Containerfile .
cp deploy/zugx.container ~/.config/containers/systemd/   # set Image=
systemctl --user daemon-reload && systemctl --user start zugx
```

CI builds and pushes `ghcr.io/<owner>/zugx`; `podman auto-update` pulls new images.

## Data & licences

- Realtime and routing: ÖBB HAFAS (unofficial API, used politely: client cache, small request bodies, honest User-Agent).
- Timetable: [ÖBB open data GTFS](https://data.oebb.at/de/datensaetze~soll-fahrplan-gtfs~), CC BY 4.0.
- Map: © OpenStreetMap contributors, OpenRailwayMap (CC BY-SA).

Code: AGPL-3.0-only.
