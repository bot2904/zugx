// Delay classes shared by the radar, train maps and delay profile (classes based on MÁV's vonatinfo,
// with on time and 1–5′ split). Two ColorBrewer palettes, user-selectable (remembered):
// - "blue":  RdYlBu, colour-blind safe (default) — blue = on time, red = very late
// - "green": RdYlGn, more intuitive for most people, but not colour-blind safe
// In both, the palest middle step is skipped (it vanishes on light maps).
import { ref, watch } from "vue";

export type DelayPalette = "blue" | "green";

export const DELAY_CLASSES = [
  { id: "ontime", max: 0 }, // exactly on time (or early)
  { id: "minor", max: 5 }, // 1–5′
  { id: "slight", max: 19 }, // 6–19′
  { id: "late", max: 59 }, // 20–59′
  { id: "verylate", max: Infinity }, // ≥ 60′
] as const;
export type DelayClassId = (typeof DELAY_CLASSES)[number]["id"];

const PALETTES: Record<DelayPalette, Record<DelayClassId, string>> = {
  blue: {
    ontime: "#4575b4",
    minor: "#91bfdb",
    slight: "#fee090",
    late: "#fc8d59",
    verylate: "#d73027",
  },
  green: {
    ontime: "#1a9850",
    minor: "#91cf60",
    slight: "#fee08b",
    late: "#fc8d59",
    verylate: "#d73027",
  },
};

/** grey: no realtime data (darker than the light 1–5′ step of both palettes) */
export const NO_DATA = "#6e7681";

const KEY = "zugx:delay-palette";
export const delayPalette = ref<DelayPalette>(
  localStorage.getItem(KEY) === "green" ? "green" : "blue",
);
watch(delayPalette, (p) => localStorage.setItem(KEY, p));

export const classColor = (id: DelayClassId) => PALETTES[delayPalette.value][id];

export const delayClass = (d?: number): DelayClassId | "nodata" =>
  d === undefined ? "nodata" : (DELAY_CLASSES.find((c) => d <= c.max)?.id ?? "nodata");

export const delayColor = (d?: number) => {
  const c = delayClass(d);
  return c === "nodata" ? NO_DATA : classColor(c);
};

/** "+7′", "−2′", "±0′" */
export const fmtSignedDelay = (d: number) => (d > 0 ? `+${d}′` : d < 0 ? `−${-d}′` : "±0′");
