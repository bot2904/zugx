# zugx

Fast, mobile-friendly, information-dense timetable browser for Austrian trains (with keyboard shortcuts on desktop) — **https://zugx.legner.me**

- Station boards with realtime delays, platforms, cancellations
- Journey search with **timeline strips**, table view, earlier/later paging, compare, "what if I miss it?"
- Train runs (Zuglauf) with delay profile and map; friendly URLs like `/train/RJX-162?d=2026-11-13`
- **Live radar** of train positions
- **Train index** of every train running in Austria in the timetable year (`/trains`)
- **Bildfahrplan** (time–distance diagrams) for corridors, **Netzgrafik** of the integrated interval timetable (+ export for SBB's Netzgrafik-Editor)
- Raw API JSON view (`d`), command palette (`Ctrl/⌘ K`), UI in English, German, Italian

See [docs/](docs/README.md) for how each feature works (data source, computation, display) and [PLAN.md](PLAN.md) for the design and decisions.

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

One container (Caddy serving `dist/` + a strict `/api/mgate` reverse proxy to ÖBB). CI builds and pushes the public image `ghcr.io/simon04/zugx:latest` on every push to `master`. The container listens on host port **9849** ("zugx" on a T9 keypad).

Linux, rootless Podman + Quadlet:

```sh
cp deploy/zugx.container ~/.config/containers/systemd/
systemctl --user daemon-reload
systemctl --user start zugx
systemctl --user enable --now podman-auto-update.timer   # pulls new images CI pushes
loginctl enable-linger                                   # keep running without a login session
curl -s localhost:9849 | head -3                         # smoke test
```

TLS: add `deploy/Caddyfile.host` to the host Caddy (`reverse_proxy 127.0.0.1:9849`) and reload it.

macOS (no Quadlet):

```sh
podman run -d --name zugx --restart=always -p 127.0.0.1:9849:8080 \
  --read-only --tmpfs /data --tmpfs /config ghcr.io/simon04/zugx:latest
```

Hardening (Containerfile + Quadlet): unprivileged user (65532), read-only root filesystem with small `noexec` tmpfs mounts, own user namespace (`UserNS=auto`), all capabilities dropped, `no-new-privileges`, memory (no swap)/CPU/PID/file limits, healthcheck on `/healthz` that kills (and so restarts) an unhealthy container, port bound to `127.0.0.1`; Caddy sends a strict CSP (no inline scripts) and `nosniff`/`Referrer-Policy`/`Permissions-Policy`/COOP headers, the `/api/mgate` proxy only allows small `POST`s to the fixed ÖBB upstream.

Local image instead of GHCR: `podman build -t localhost/zugx -f deploy/Containerfile .`, then set `Image=localhost/zugx` and `AutoUpdate=local` in the unit.

## Data & licences

- Realtime and routing: ÖBB HAFAS (unofficial API, used politely: client cache, small request bodies, honest User-Agent).
- Timetable: [ÖBB open data GTFS](https://data.oebb.at/de/datensaetze~soll-fahrplan-gtfs~), CC BY 4.0.
- Map: © OpenStreetMap contributors, OpenRailwayMap (CC BY-SA).

Code: AGPL-3.0-only.
