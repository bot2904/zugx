// Delay classes shared by the radar, train maps and delay profile (based on MÁV's vonatinfo, finer
// in the low range: 0 / 1–2 / 3–5 / 6–9 / 10–19 / 20–59 / 60+). Two ColorBrewer palettes, user-selectable (remembered):
// - "green": RdYlGn, more intuitive for most people (default), but not colour-blind safe
// - "blue":  RdYlBu, colour-blind safe — blue = on time, red = very late
// Both from the 9-class scheme; the two palest middle steps are skipped (they vanish on light maps).
import { useLocalStorage } from "@vueuse/core";

export type DelayPalette = "blue" | "green";

export const DELAY_CLASSES = [
  { id: "ontime", max: 0 }, // exactly on time (or early)
  { id: "d1", max: 2 }, // 1–2′
  { id: "d3", max: 5 }, // 3–5′
  { id: "d6", max: 9 }, // 6–9′
  { id: "d10", max: 19 }, // 10–19′
  { id: "d20", max: 59 }, // 20–59′
  { id: "d60", max: Infinity }, // ≥ 60′
] as const;
export type DelayClassId = (typeof DELAY_CLASSES)[number]["id"];

const PALETTES: Record<DelayPalette, Record<DelayClassId, string>> = {
  blue: {
    ontime: "#4575b4",
    d1: "#74add1",
    d3: "#abd9e9",
    d6: "#fee090",
    d10: "#fdae61",
    d20: "#f46d43",
    d60: "#d73027",
  },
  green: {
    ontime: "#1a9850",
    d1: "#66bd63",
    d3: "#a6d96a",
    d6: "#fee08b",
    d10: "#fdae61",
    d20: "#f46d43",
    d60: "#d73027",
  },
};

/** grey: no realtime data (darker than the light steps of both palettes) */
export const NO_DATA = "#6e7681";

const KEY = "zugx:delay-palette";
export const delayPalette = useLocalStorage<DelayPalette>(KEY, "green");

export const classColor = (id: DelayClassId) => PALETTES[delayPalette.value][id];

export const delayClass = (d?: number): DelayClassId | "nodata" =>
  d === undefined ? "nodata" : (DELAY_CLASSES.find((c) => d <= c.max)?.id ?? "nodata");

export const delayColor = (d?: number) => {
  const c = delayClass(d);
  return c === "nodata" ? NO_DATA : classColor(c);
};

/** "+7′", "−2′", "±0′" */
export const fmtSignedDelay = (d: number) => (d > 0 ? `+${d}′` : d < 0 ? `−${-d}′` : "±0′");
