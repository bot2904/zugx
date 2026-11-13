# Add to calendar

Button 📅 in the journey details and on the connection permalink page.

## Data

The connection as shown (HAFAS `TripSearch` / `Reconstruction`), including realtime delays at the moment of export.

## How it works

An iCalendar file (RFC 5545) is generated in the browser — nothing is sent anywhere:

- **Title**: `Wien Hbf → Graz Hbf · RJX 135` (all trains joined with `/`).
- **Time**: planned departure to planned arrival, in UTC (correct in any time zone).
- **Location**: departure station and platform, plus coordinates.
- **Body**: per train its direction, departure/arrival times, stations and platforms (`[realtime 13:05]` if delayed), transfer and walking times, total duration and number of changes, and a deep link "Open in zugx" to the permalink (`/trip/<token>`), which shows the connection with live data.
- **Reminder**: 15 minutes before departure. The text follows the UI language.

Delivery: on touch devices the file is handed to the system share sheet (Web Share API) so the calendar app can be picked; on desktop it is downloaded as `.ics`. Note: Google Calendar on Android does not import `.ics` files; Samsung Calendar, Etar, Outlook, Apple and desktop calendars do.
