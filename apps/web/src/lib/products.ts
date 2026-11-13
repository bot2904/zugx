// Product colours & categories (dense, ÖBB-ish palette).
import type { Line, ProductId } from "@zugx/hafas";

export const LONG_DISTANCE = new Set([
  "RJX",
  "RJ",
  "ICE",
  "EC",
  "IC",
  "NJ",
  "EN",
  "D",
  "WB",
  "TGV",
  "ECE",
  "IR",
  "ES",
  "FR",
  "EX",
  "SC",
]);
export const REGIONAL = new Set(["CJX", "REX", "R", "RB", "RE", "ER", "Os", "SB"]);
export const SUBURBAN = new Set(["S"]);
export const NIGHT = new Set(["NJ", "EN"]);

const CAT_COLORS: Record<string, string> = {
  RJX: "#c8102e",
  RJ: "#c8102e",
  ICE: "#8c939b",
  EC: "#a6192e",
  IC: "#a6192e",
  NJ: "#3b3f8f",
  EN: "#3b3f8f",
  D: "#9e3d22",
  WB: "#4a9c3c",
  CJX: "#0060f0",
  REX: "#2f7bd8",
  R: "#5592d9",
  S: "#3367aa",
};

const PRODUCT_COLORS: Record<ProductId, string> = {
  highspeed: "#c8102e",
  night: "#3b3f8f",
  intercity: "#a6192e",
  interregional: "#9e3d22",
  regional: "#2f7bd8",
  suburban: "#3367aa",
  bus: "#7a8a2e",
  ferry: "#1d8a99",
  subway: "#a3529a",
  tram: "#d4433a",
  cable: "#6b6b6b",
  ondemand: "#6b6b6b",
  other: "#6b6b6b",
};

export function lineColor(line?: Pick<Line, "category" | "product">): string {
  if (!line) return "var(--muted)";
  return CAT_COLORS[line.category] ?? PRODUCT_COLORS[line.product] ?? "#6b6b6b";
}

export function categoryColor(cat: string): string {
  return (
    CAT_COLORS[cat] ?? (SUBURBAN.has(cat) ? "#3367aa" : REGIONAL.has(cat) ? "#2f7bd8" : "#6b6b6b")
  );
}

/** product filter groups for UI chips → HAFAS class bitmask */
export const PRODUCT_GROUPS: { id: string; cls: number }[] = [
  { id: "highspeed", cls: 1 },
  { id: "night", cls: 2 },
  { id: "intercity", cls: 4 },
  { id: "interregional", cls: 8 | 4096 },
  { id: "regional", cls: 16 },
  { id: "suburban", cls: 32 },
  { id: "bus", cls: 64 },
  { id: "subway", cls: 256 },
  { id: "tram", cls: 512 },
  { id: "other", cls: 128 | 1024 | 2048 },
];
export const ALL_CLS = PRODUCT_GROUPS.reduce((a, g) => a | g.cls, 0);

/** default for station boards: trains only */
export const RAIL_CLS = 1 | 2 | 4 | 8 | 16 | 32 | 4096;
