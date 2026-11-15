// The global Live switch (navbar): realtime (HAFAS) or timetable (GTFS) where a page has both —
// station: live board ⇄ departure plan; Bildfahrplan: realtime overlay. Remembered. Only for
// Austria (ÖBB HAFAS): with another country selected it is off and the button disabled.
import { useLocalStorage } from "@vueuse/core";
import { computed } from "vue";
import { country } from "./country.ts";

const stored = useLocalStorage("zugx:live", true);

/** realtime data exists for the selected country */
export const liveAvailable = computed(() => country.value === "at");

/** Live on (always off where there is no realtime data; the stored choice stays) */
export const liveMode = computed<boolean>({
  get: () => liveAvailable.value && stored.value,
  set: (v) => {
    if (liveAvailable.value) stored.value = v;
  },
});
