# Live radar

`/radar`

## Data

HAFAS `JourneyGeoPos` (live) for the visible map area, up to 1000 trains, refreshed every 15 s and after panning/zooming.

## How it is shown

- One dot per train. **Colour by delay** (default, scale like MÁV's [vonatinfo](https://vonatinfo.mav.hu/)): green ≤ 5′, yellow 6–19′, orange 20–59′, red ≥ 60′, grey = no realtime data. The delay is the realtime deviation at the stop (of the few HAFAS sends around the train's position) whose planned time is closest to now. The legend shows counts per class; switch to **colour by category** there (choice is remembered). Positions are **calculated by HAFAS** from the (realtime) timetable, not GPS.
- Product chips filter by HAFAS class (default: rail only).
- Hover (desktop) or first tap (touch) shows the train and its direction; click / second tap opens the train run.
- Map: OpenStreetMap tiles (desaturated) with the OpenRailwayMap overlay.
