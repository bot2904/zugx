# Train run (Zuglauf)

`/train/<journey-id>` (from boards/journeys) or the friendly `/train/RJX-162?d=2026-11-13`.

## Data

- Friendly URLs: HAFAS `JourneyMatch` finds the train by category + number for the date; if several match, a list is shown.
- HAFAS `JourneyDetails` (live): all stops with planned/realtime times and platforms, remarks, running days text, route geometry (polyline). Refreshed every 30 s.

## How it is shown

- **Stop list**: arrival and departure times with delays, platform; cancelled stops struck through, additional stops marked `+`. Stops already passed are faded; the current position is the filled dot (pulsing while the train stands at a station) — computed from realtime times vs. now.
- **Delay profile**: delay per stop (departure delay, else arrival delay) as a line; dots green/amber/red.
- **Map**: HAFAS route polyline (falls back to straight lines between stops), stops as markers with tooltips.
- **Running days**: HAFAS' own text (e.g. "not every day: 13 Nov until 12 Dec 2026").
- **Operator**: see [station-board.md](station-board.md) for the "Nahreisezug" placeholder.
- ‹ › moves to the previous/next day by train number.
