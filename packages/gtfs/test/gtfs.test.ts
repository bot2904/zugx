import { describe, expect, it } from "vite-plus/test";
import {
  CsvParser,
  dayNumber,
  isoDay,
  parseCsv,
  parseGtfsTime,
  timetableYear,
  validate,
} from "../src/index.ts";

describe("csv", () => {
  it("parses quoted fields, escapes, CRLF and BOM", () => {
    const rows = parseCsv('﻿a,b,c\r\n"1","x, ""y""",\r\n2,plain,"multi\nline"\n');
    expect(rows).toEqual([
      { a: "1", b: 'x, "y"', c: "" },
      { a: "2", b: "plain", c: "multi\nline" },
    ]);
  });

  it("handles chunk boundaries anywhere", () => {
    const text = 'id,name\n"1","a ""quoted"" name"\n2,"b,c"\r\n3,d';
    const whole = parseCsv(text);
    for (let cut = 1; cut < text.length; cut++) {
      const rows: string[][] = [];
      const p = new CsvParser((r) => rows.push(r));
      p.push(text.slice(0, cut));
      p.push(text.slice(cut));
      p.end();
      expect(rows.slice(1), `cut ${cut}`).toEqual(whole.map((o) => [o.id, o.name]));
    }
  });
});

describe("dates", () => {
  it("computes timetable years", () => {
    expect(timetableYear(2026)).toEqual({ begin: "2025-12-14", end: "2026-12-12", days: 364 });
    expect(timetableYear(2027).begin).toBe("2026-12-13");
  });

  it("converts days", () => {
    expect(isoDay(dayNumber("20251214"))).toBe("2025-12-14");
    expect(parseGtfsTime("25:42:00")).toBe(25 * 3600 + 42 * 60);
  });
});

describe("json schema subset", () => {
  const schema = {
    type: "array",
    items: {
      type: "object",
      additionalProperties: false,
      required: ["id"],
      properties: { id: { type: "string", pattern: "^\\d+$" }, w: { type: "integer", minimum: 1 } },
    },
  };

  it("accepts valid data", () => {
    expect(validate(schema, [{ id: "1", w: 3 }])).toEqual([]);
  });

  it("reports errors", () => {
    expect(validate(schema, [{ id: "x", w: 0.5, z: 1 }, {}])).toEqual([
      '$[0].id: "x" does not match ^\\d+$',
      "$[0].w: expected integer, got number",
      "$[0]: unexpected property z",
      "$[1]: missing id",
    ]);
  });
});
