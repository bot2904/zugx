// Delay colour scale shared by the radar, train maps and delay profile (like MÁV's vonatinfo).
export const DELAY_CLASSES = [
  { id: "ontime", max: 5, color: "#2fb344" },
  { id: "slight", max: 19, color: "#f2c94c" },
  { id: "late", max: 59, color: "#f2994a" },
  { id: "verylate", max: Infinity, color: "#e5383b" },
] as const;

/** grey: no realtime data */
export const NO_DATA = "#9aa0a6";

export const delayClass = (d?: number) =>
  d === undefined ? "nodata" : (DELAY_CLASSES.find((c) => d <= c.max)?.id ?? "nodata");

export const delayColor = (d?: number) =>
  d === undefined ? NO_DATA : (DELAY_CLASSES.find((c) => d <= c.max)?.color ?? NO_DATA);

/** "+7′", "−2′", "±0′" */
export const fmtSignedDelay = (d: number) => (d > 0 ? `+${d}′` : d < 0 ? `−${-d}′` : "±0′");
