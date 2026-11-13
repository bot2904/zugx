# Station board (departures / arrivals)

`/station/<hafas-id>` — query: `arr` (arrivals), `t=YYYY-MM-DDTHH:MM` (time), `p=<bitmask>` (products).

## Data

HAFAS `StationBoard` (live): the next 90 minutes, up to 60 trains, from the given time (default: now).

## How it is shown

- **Time**: planned time; superscript delay in minutes (`+3`, `±0`), coloured green / amber (1–4′) / red (≥ 5′). If delayed, the expected time follows. No superscript = no realtime data for that train.
- **Cancelled** trains are struck through and marked.
- **Platform**: realtime platform; amber + bold if it differs from the planned one (tooltip shows both).
- **Products**: by default only rail (RJX/RJ/ICE, EC/IC, D/NJ/WB, regional, S-Bahn, rail replacement). Big stations like Wien Hbf are "meta stations" in HAFAS that also list trams and buses — enable them with the chips.
- HAFAS product classes: 1 RJX/RJ/ICE, 2 rail replacement bus, 4 EC/IC, 8 D/NJ/EN, 16 regional, 32 S-Bahn, 64 bus, 256 U-Bahn, 512 tram, 4096 WESTbahn & other long distance. Night trains have no own class; they are recognised by category (NJ, EN).
- **Operator**: shown when not ÖBB. HAFAS returns an id-less placeholder "Nahreisezug" for trains ÖBB runs itself; zugx replaces it with the operator from the train's UIC company code (81 → ÖBB, 80 → DB, 55 → MÁV …).
- Clicking a row shows remarks (accessibility, bikes, disruptions); the direction links to the train run.
- **Auto-refresh** every 30 s when showing "now" and the tab is visible.
