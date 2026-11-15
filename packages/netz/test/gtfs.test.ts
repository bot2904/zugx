import { describe, expect, it } from "vite-plus/test";
import { csvRecords, csvRows } from "../src/csv.ts";
import {
  activeServices,
  feedPeriod,
  loadFeed,
  serviceDays,
  parentDhid,
  parseGtfsTime,
  type TableSource,
} from "../src/gtfs.ts";

describe("csv", () => {
  it("parses quotes, escaped quotes, CRLF and a BOM", () => {
    const rows = [
      ...csvRows([String.fromCharCode(0xfeff) + 'a,b,c\r\n"x, y","say ""hi""",3\r\n', "\n,,\n"]),
    ];
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["x, y", 'say "hi"', "3"],
      ["", "", ""],
    ]);
  });

  it("handles chunk boundaries anywhere", () => {
    const text = 'id,name\n"1","Wien ""Hbf"""\n2,"multi\nline"\n3,last';
    const expected = [...csvRows([text])];
    for (let cut = 1; cut < text.length; cut++) {
      expect([...csvRows([text.slice(0, cut), text.slice(cut)])]).toEqual(expected);
    }
    expect(expected[1]).toEqual(["1", 'Wien "Hbf"']);
    expect(expected[2]).toEqual(["2", "multi\nline"]);
  });

  it("yields header-keyed records", () => {
    expect([...csvRecords(["a,b\n1,2\n"])]).toEqual([{ a: "1", b: "2" }]);
  });
});

describe("gtfs", () => {
  const tables: Record<string, string> = {
    stops: [
      "stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station",
      "Pat:1:1,A Hauptbahnhof,47,13,1,",
      "at:1:1:0:1,A Hauptbahnhof,47,13,,Pat:1:1",
      "at:1:2:0:1,B Bahnhof,47,14,,", // no parent: derived Pat:1:2
    ].join("\n"),
    routes: "route_id,route_type\nr1,2\nbus,3",
    trips: [
      "route_id,service_id,trip_id,trip_headsign,trip_short_name",
      "r1,daily,t1,B Bahnhof,RJX 760",
      "r1,weekend,t2,B Bahnhof,R 1",
      "bus,daily,t3,B,SEV 1",
      "r1,extra,t4,A Hauptbahnhof,REX 7",
    ].join("\n"),
    calendar: [
      "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date",
      "daily,1,1,1,1,1,1,1,20251214,20261212",
      "weekend,0,0,0,0,0,1,1,20251214,20261212",
    ].join("\n"),
    calendar_dates: "service_id,date,exception_type\nextra,20260310,1\ndaily,20260311,2",
    stop_times: [
      "trip_id,arrival_time,departure_time,stop_id,stop_sequence,shape_dist_traveled",
      "t1,25:10:00,25:12:00,at:1:2:0:1,2,50000",
      "t1,24:30:00,24:30:00,at:1:1:0:1,1,0",
      "t4,08:00:00,08:00:00,at:1:2:0:1,1,0",
      "t4,08:30:30,08:31:00,at:1:1:0:1,2,50000",
      "t3,08:00:00,08:00:00,at:1:1:0:1,1,0",
      "t3,09:00:00,09:00:00,at:1:2:0:1,2,",
    ].join("\n"),
  };
  const src: TableSource = (n) => (tables[n] === undefined ? undefined : [tables[n]!]);

  it("parses times past midnight", () => {
    expect(parseGtfsTime("25:10:00")).toBe(1510);
    expect(parseGtfsTime("08:30:30")).toBe(511);
  });

  it("derives parent DHIDs", () => {
    expect(parentDhid("at:48:817:0:2")).toBe("Pat:48:817");
    expect(parentDhid("de:09162:100:3:5")).toBe("Pde:09162:100");
  });

  it("applies calendar weekdays and exceptions", () => {
    expect([...activeServices(src, "2026-03-10")].sort()).toEqual(["daily", "extra"]);
    expect([...activeServices(src, "2026-03-11")]).toEqual([]);
    expect([...activeServices(src, "2026-03-14")].sort()).toEqual(["daily", "weekend"]);
  });

  it("computes running days per service over the period", () => {
    expect(feedPeriod(src)).toEqual({ begin: "2025-12-14", end: "2026-12-12" });
    const d = serviceDays(src, "2026-03-09", "2026-03-15"); // Mon … Sun
    expect([...d.get("daily")!].sort((a, b) => a - b)).toEqual([0, 1, 3, 4, 5, 6]); // not Wed 11th
    expect([...d.get("weekend")!].sort((a, b) => a - b)).toEqual([5, 6]);
    expect([...d.get("extra")!]).toEqual([1]);
  });

  it("loads all trips of the feed when no day is given", () => {
    const f = loadFeed(src, null);
    const ids = f.trips.map((t) => t.id);
    expect(ids).toContain("t1");
    expect(ids).toContain("t4"); // runs only on the "extra" day, but no day filter here
    expect(f.trips.every((t) => t.service)).toBe(true);
  });

  it("loads rail trips of the day with sorted stops and parent stations", () => {
    const f = loadFeed(src, "2026-03-10");
    expect(f.trips.map((t) => t.id).sort()).toEqual(["t1", "t4"]);
    const t1 = f.trips.find((t) => t.id === "t1")!;
    expect(t1.cat).toBe("RJX");
    expect(t1.nr).toBe("760");
    expect(t1.headsign).toBe("B");
    expect(t1.stops.map((s) => [s.st, s.arr, s.dep, s.dist])).toEqual([
      ["Pat:1:1", 1470, 1470, 0],
      ["Pat:1:2", 1510, 1512, 50000],
    ]);
    expect(f.stations.get("Pat:1:1")!.name).toBe("A Hbf");
    expect(f.stations.get("Pat:1:2")!.name).toBe("B");
  });
});
