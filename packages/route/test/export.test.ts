import { describe, expect, it } from "vite-plus/test";
import { parseStopEntry, stopEntry } from "../src/export.ts";

describe("routing input stop entries", () => {
  it("writes the departure only when it differs, and the boarding flags", () => {
    expect(stopEntry("at:49:1349:0:31", 558, 568)).toBe("at:49:1349:0:31 558 568");
    expect(stopEntry("1122804", 600, 600)).toBe("1122804 600");
    expect(stopEntry("x", 1500, 1502, 1, 1)).toBe("x 1500 1502 -p -d");
  });
  it("reads back what it writes", () => {
    expect(parseStopEntry("x 1500 1502 -p -d")).toEqual({
      id: "x",
      arr: 1500,
      dep: 1502,
      pickup: false,
      dropoff: false,
    });
    expect(parseStopEntry("1122804 600")).toEqual({
      id: "1122804",
      arr: 600,
      dep: 600,
      pickup: true,
      dropoff: true,
    });
  });
});
