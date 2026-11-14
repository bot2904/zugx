import { describe, expect, it } from "vite-plus/test";
import { parse } from "smol-toml";
import { fromToml, toToml } from "../src/index.ts";

describe("data TOML", () => {
  it("round-trips nested data, null as empty string", () => {
    const data = {
      id: "westbahn",
      km: 1.5,
      major: true,
      aliases: { brenner: "300", "Pat:41:1": "x" },
      stations: [
        { id: "Pat:49:1349", name: 'Wien "Hbf"\nÖ', km: 0 },
        { id: "a", name: "b", km: 2, p: ["S", "R"] },
      ],
      trains: [
        {
          cat: "S",
          pts: [
            [0, null, 2],
            [1, 4, null],
          ],
        },
      ],
      lines: [
        {
          id: "l1",
          takt: null,
          fwd: { travel: [48, 36], stops: [{ node: "A", arr: null, dep: 10 }] },
        },
        { id: "l2", takt: 60, fwd: { travel: [], stops: [] } },
      ],
      empty: {},
    };
    const text = toToml(data);
    expect(fromToml(text)).toEqual(data);
    // one record per line
    expect(text).toContain('  { cat = "S", pts = [[0, "", 2], [1, 4, ""]] },');
    expect(text).toContain("[[lines]]");
    // stored null is really an empty string in TOML
    expect((parse(text) as { trains: { pts: unknown[][] }[] }).trains[0]!.pts[0]![1]).toBe("");
  });

  it("writes big flat maps as sections with one entry per line", () => {
    const stations = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`${i}`, `S${i}`]));
    const text = toToml({ year: 2026, stations });
    expect(text).toContain('[stations]\n0 = "S0"\n1 = "S1"');
    expect(fromToml(text)).toEqual({ year: 2026, stations });
  });

  it("refuses real empty strings and a non-object root", () => {
    expect(() => toToml({ a: [{ name: "" }] })).toThrow(/a\[0\]\.name: empty string/);
    expect(() => toToml([1, 2])).toThrow(/root must be an object/);
  });
});
