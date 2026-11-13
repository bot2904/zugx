# Journey search

`/j/<from>/<to>` — query: `t` (time), `arr` (time is arrival), `via`, `p` (products), `chg` (min. transfer time). Permalink of one connection: `/trip/<token>`.

## Data

- HAFAS `TripSearch` (live): ~6 connections per request. _Earlier_/_Later_ use HAFAS paging tokens and are merged into the list.
- HAFAS `Reconstruction` for permalinks: every connection has a reconstruction context (`recon.ctx`); zugx stores it base64url-encoded in `/trip/<token>`, so the link reloads the same connection with fresh realtime data (refreshed every 60 s).

## How it is shown

- **Timeline strips** (default): all connections share one time axis; one row per connection, one bar per train, coloured by category. Walks are dotted. If a train is delayed, the planned bar is drawn faded behind the realtime one. Transfer gaps are labelled in minutes: amber if < 5′, red with a cross line if the realtime connection is broken (negative).
- **Table view** (`v`): departure, arrival, duration, transfers, trains, first platform.
- **Details**: leg list with times, delays, platforms, expandable intermediate stops, remarks, transfer times. Buttons: map (permalink page with route polylines from HAFAS), copy link, add to calendar.
- **What if I miss it?**: re-plans from the transfer station to the destination, starting one minute after the planned departure of the connecting train.
- **Compare**: tick connections to see their leg lists side by side.
