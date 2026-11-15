# Station board (departures / arrivals)

`/station/<hafas-id>` — query: `arr` (arrivals), `t=YYYY-MM-DDTHH:MM` (time), `p=<bitmask>` (products).

## Data

HAFAS `StationBoard` (live): the next 90 minutes, up to 60 trains, from the given time (default: now).

## How it is shown

- **Time**: planned time; superscript delay in minutes (`+3`, `±0`), coloured green / amber (1–4′) / red (≥ 5′). If delayed, the expected time follows. No superscript = no realtime data for that train.
- **Cancelled** trains are struck through and marked.
- **Platform**: realtime platform; amber + bold if it differs from the planned one (tooltip shows both).
- **Products**: by default only rail (RJX/RJ/ICE, EC/IC/IR, D/NJ/WB, regional, S-Bahn, rail replacement). Big stations like Wien Hbf are "meta stations" in HAFAS that also list trams and buses — enable them with the chips.
- HAFAS product classes: 1 RJX/RJ/ICE, 2 rail replacement bus, 4 EC/IC/IR, 8 D/NJ/EN, 16 regional, 32 S-Bahn, 64 bus, 256 U-Bahn, 512 tram, 4096 WESTbahn & other long distance. Night trains have no own class; they are recognised by category (NJ, EN).
- **Operator**: shown when not ÖBB. HAFAS returns an id-less placeholder "Nahreisezug" for trains ÖBB runs itself; zugx replaces it with the operator from the train's UIC company code (81 → ÖBB, 80 → DB, 55 → MÁV …).
- Clicking a row shows remarks (accessibility, bikes, disruptions); the direction links to the train run.
- **Auto-refresh** every 30 s when showing "now" and the tab is visible.
- **Earlier / Later** (keys `h` / `l`) load the previous / next departures and add them above / below the shown ones (nothing is removed). Only the initial window auto-refreshes; the time input jumps to another time and starts a new list.

## Departure poster

`/station/<id>/plan?d=YYYY-MM-DD` (link "Abfahrtsplan" on the station board): every train leaving the station on the chosen day, from the timetable (GTFS) instead of live data — in the layout of the printed posters in the stations ("Abfahrt"): black header, yellow sheet, hours in newspaper columns, per departure the time, train (linked to its run on that day), destination, following stops ("über", up to 8) and platform. Date like the Bildfahrplan (←/→, date picker, today); print-ready.

Data: `packages/trains/data/departures/<HAFAS id>.toml`, built by `vp run departures:build` (`packages/trains/src/departures.ts`, after `stations:build`; also in the weekly data workflow): per station all rail departures of the timetable year — `[minutes after midnight of the service day, category, number, destination id, following stop ids, running-days index, platform]`, one per line; identical departures merged over the year, their running days as base64 bitsets stored once per file (`days`). 1,104 stations, ~108,000 rows, 14 MB in total (Wien Hbf 188 KB / 19 KB gzip); one file per station, loaded on demand (`dep-*` chunks, not precached). Platforms: GTFS `platform_code`. Names in the app from the station index (as in the search).
