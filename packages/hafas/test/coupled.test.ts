import { describe, expect, it } from "vite-plus/test";
import { compareParts, groupMovements, type Line, type Movement } from "../src/index.ts";

const line = (name: string, product: Line["product"] = "highspeed"): Line => {
  const [category = "", number = ""] = name.split(" ");
  return { name, category, number, cls: 1, product };
};
const mv = (name: string, lat: number, stop: string, time: string, product?: Line["product"]) =>
  ({
    journeyId: `jid ${name}`,
    line: line(name, product),
    direction: "",
    lat,
    lon: 13,
    nextStops: [{ stop: { id: stop, name: stop, type: "station" }, arr: { planned: time } }],
  }) as Movement;

describe("coupled train parts", () => {
  it("orders the likely operational train first", () => {
    const names = ["EN 40462", "NJ 466", "EN 50462"].map((n) => line(n));
    expect(names.sort(compareParts).map((l) => l.name)).toEqual(["NJ 466", "EN 40462", "EN 50462"]);
    expect([line("RJX 19981"), line("RJX 61")].sort(compareParts)[0]!.name).toBe("RJX 61");
  });
  it("merges radar movements at the same position sharing a stop time", () => {
    const g = groupMovements([
      mv("EN 40462", 47.1, "Bludenz", "T1"),
      mv("NJ 466", 47.1, "Bludenz", "T1"),
      mv("NJ 466", 47.1, "Bludenz", "T1"), // duplicate entry
      mv("RJX 61", 47.1, "Linz", "T2"), // same position, different train
      mv("Bus S2", 48, "X", "T3", "bus"),
      mv("Bus S2", 48, "X", "T3", "bus"),
    ]);
    expect(g.map((p) => p.map((m) => m.line.name).join(" / "))).toEqual([
      "Bus S2",
      "Bus S2",
      "NJ 466 / EN 40462",
      "RJX 61",
    ]);
  });
});
