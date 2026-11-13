# Live radar

`/radar`

## Data

HAFAS `JourneyGeoPos` (live) for the visible map area, up to 1000 trains, refreshed every 15 s and after panning/zooming.

## How it is shown

- One dot per train. **Colour by delay** (default; classes like MÁV's [vonatinfo](https://vonatinfo.mav.hu/), colours from ColorBrewer — RdYlGn (green) by default, colour-blind-safe RdYlBu (blue) selectable in the radar legend and remembered for all maps): green (or dark blue) on time, light green (or light blue) 1–5′, yellow 6–19′, orange 20–59′, red ≥ 60′, grey = no realtime data. The delay is the realtime deviation at the stop (of the few HAFAS sends around the train's position) whose planned time is closest to now. Switch between **colour by delay** and **colour by category** in the top bar ("Colour: Delay | Category"; the choice is remembered). The legend (bottom left) shows the counts per delay class or per category. Positions are **calculated by HAFAS** from the (realtime) timetable, not GPS.
- Product chips filter by HAFAS class (default: rail only).
- Hover (desktop) or first tap (touch) shows the train and its direction; click / second tap opens the train run.
- Map: [OpenFreeMap](https://openfreemap.org/) vector base map (Positron in light, Dark in dark theme; railway lines slightly emphasised). The [OpenRailwayMap](https://www.openrailwaymap.org/) overlay is optional ("Railway map" toggle, remembered), desaturated so it stays in the background. Same for all maps.
