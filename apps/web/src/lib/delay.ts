// Delay colour scale shared by the radar, train maps and delay profile (based on MÁV's vonatinfo,
// with on time and 1–5′ split).
// ColorBrewer RdYlGn (6 classes, ordered good → bad; the pale #d9ef8b is skipped as too close to
// light green). Not colour-blind safe: the class is also in the tooltip and the legend counts.
export const DELAY_CLASSES = [
  { id: "ontime", max: 0, color: "#1a9850" }, // exactly on time (or early)
  { id: "minor", max: 5, color: "#91cf60" }, // 1–5′
  { id: "slight", max: 19, color: "#fee08b" }, // 6–19′
  { id: "late", max: 59, color: "#fc8d59" }, // 20–59′
  { id: "verylate", max: Infinity, color: "#d73027" }, // ≥ 60′
] as const;

/** grey: no realtime data */
export const NO_DATA = "#9aa0a6";

export const delayClass = (d?: number) =>
  d === undefined ? "nodata" : (DELAY_CLASSES.find((c) => d <= c.max)?.id ?? "nodata");

export const delayColor = (d?: number) =>
  d === undefined ? NO_DATA : (DELAY_CLASSES.find((c) => d <= c.max)?.color ?? NO_DATA);

/** "+7′", "−2′", "±0′" */
export const fmtSignedDelay = (d: number) => (d > 0 ? `+${d}′` : d < 0 ? `−${-d}′` : "±0′");
