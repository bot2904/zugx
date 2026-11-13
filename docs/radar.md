# Live radar

`/radar`

## Data

HAFAS `JourneyGeoPos` (live) for the visible map area, up to 1000 trains, refreshed every 15 s and after panning/zooming.

## How it is shown

- One dot per train, coloured by category. Positions are **calculated by HAFAS** from the (realtime) timetable, not GPS.
- Product chips filter by HAFAS class (default: rail only).
- Hover (desktop) or first tap (touch) shows the train and its direction; click / second tap opens the train run.
- Map: OpenStreetMap tiles (desaturated) with the OpenRailwayMap overlay.
