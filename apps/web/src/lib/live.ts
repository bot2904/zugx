// The global Live switch (navbar): realtime (HAFAS) or timetable (GTFS) where a page has both —
// station: live board ⇄ departure plan; Bildfahrplan: realtime overlay. Remembered.
import { useLocalStorage } from "@vueuse/core";

export const liveMode = useLocalStorage("zugx:live", true);
