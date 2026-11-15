import { describe, expect, it } from "vite-plus/test";
import { dayNumber, recordSource, serviceDays, type Db } from "../src/query.ts";

/** a stand-in for the node-gtfs database: canned rows per table */
function fakeDb(tables: Record<string, Record<string, unknown>[]>): Db {
  const rowsFor = (sql: string) => tables[/from (\w+)/.exec(sql)?.[1] ?? ""] ?? [];
  return {
    prepare: (sql: string) => ({
      all: () => rowsFor(sql),
      iterate: () => rowsFor(sql)[Symbol.iterator](),
    }),
  } as unknown as Db;
}

describe("db query helpers", () => {
  it("days since 1970-01-01 from GTFS dates", () => {
    expect(dayNumber("19700101")).toBe(0);
    expect(dayNumber(20260310)).toBe(dayNumber("20260310"));
    expect(dayNumber("20260310") - dayNumber("20260309")).toBe(1);
  });

  it("service days: calendar weekdays, then calendar_dates added/removed", () => {
    const week = {
      monday: 1,
      tuesday: 1,
      wednesday: 1,
      thursday: 1,
      friday: 1,
      saturday: 0,
      sunday: 0,
    };
    const db = fakeDb({
      calendar: [{ service_id: "wd", start_date: "20260309", end_date: "20260315", ...week }],
      calendar_dates: [
        { service_id: "wd", date: "20260311", exception_type: 2 }, // not Wednesday
        { service_id: "wd", date: "20260314", exception_type: 1 }, // extra Saturday
        { service_id: "extra", date: "20260315", exception_type: 1 },
      ],
    });
    const d = serviceDays(db);
    const mon = dayNumber("20260309");
    expect(d.get("wd")!.map((x) => x - mon)).toEqual([0, 1, 3, 4, 5]);
    expect(d.get("extra")!.map((x) => x - mon)).toEqual([6]);
  });

  it("record source: values as text, null as empty, unknown tables empty", () => {
    const db = fakeDb({ stops: [{ stop_id: "a", stop_lat: 48.2, parent_station: null }] });
    expect([...recordSource(db).records("stops")]).toEqual([
      { stop_id: "a", stop_lat: "48.2", parent_station: "" },
    ]);
    expect([...recordSource(db).records("shapes")]).toEqual([]);
  });
});
