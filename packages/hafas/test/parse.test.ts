import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import {
  createClient,
  decodePolyline,
  parseDuration,
  parseTime,
  dirGeoBearing,
  runningDays,
} from "../src/index.ts";

const fixture = (name: string) =>
  JSON.parse(readFileSync(join(import.meta.dirname, "..", "fixtures", `${name}.json`), "utf8"));

/** A fake fetch that answers each method with its recorded fixture. */
function fixtureClient() {
  const byMeth: Record<string, string> = {
    LocMatch: "loc-match",
    LocGeoPos: "loc-geo-pos",
    TripSearch: "trip-search",
    Reconstruction: "reconstruction",
    JourneyDetails: "journey-details",
    JourneyMatch: "journey-match",
    JourneyGeoPos: "journey-geo-pos",
    HimSearch: "him-search",
  };
  const calls: any[] = [];
  const fetch = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    calls.push(body);
    const req = body.svcReqL[0];
    const name =
      req.meth === "StationBoard"
        ? req.req.type === "ARR"
          ? "station-board-arr"
          : "station-board"
        : byMeth[req.meth];
    return new Response(JSON.stringify(fixture(name!).response));
  }) as typeof globalThis.fetch;
  return { client: createClient({ fetch, endpoint: "/api/mgate" }), calls };
}

describe("time parsing", () => {
  it("parses HHMMSS with explicit offset", () => {
    expect(parseTime("20261113", "122400", 60)).toBe("2026-11-13T12:24:00+01:00");
  });
  it("parses day offset", () => {
    expect(parseTime("20261113", "01003000", 60)).toBe("2026-11-14T00:30:00+01:00");
  });
  it("falls back to Europe/Vienna offset (summer)", () => {
    expect(parseTime("20260701", "080000")).toBe("2026-07-01T08:00:00+02:00");
    // night of the switch to winter time: 02:30 exists twice ("compatible" = the earlier, CEST)
    expect(parseTime("20261025", "023000")).toBe("2026-10-25T02:30:00+02:00");
    expect(parseTime("20261025", "033000")).toBe("2026-10-25T03:30:00+01:00");
    // day offset across the end of a month
    expect(parseTime("20261130", "01003000")).toBe("2026-12-01T00:30:00+01:00");
  });
  it("parses durations", () => {
    expect(parseDuration("023600")).toBe(156);
    expect(parseDuration("01020000")).toBe(1560);
  });
});

describe("currentDelay", () => {
  it("takes the realtime stop closest to now", async () => {
    const { currentDelay } = await import("../src/index.ts");
    const ev = (planned: string, delay?: number) => ({ planned, delay });
    const stops = [
      {
        stop: { id: "1", name: "A", type: "station" as const },
        dep: ev("2026-11-13T10:00:00+01:00", 2),
      },
      {
        stop: { id: "2", name: "B", type: "station" as const },
        arr: ev("2026-11-13T10:30:00+01:00", 7),
      },
      {
        stop: { id: "3", name: "C", type: "station" as const },
        arr: ev("2026-11-13T11:00:00+01:00"),
      },
    ];
    expect(currentDelay(stops, Temporal.Instant.from("2026-11-13T10:05:00+01:00"))).toBe(2);
    expect(currentDelay(stops, Temporal.Instant.from("2026-11-13T10:50:00+01:00"))).toBe(7);
    expect(currentDelay([{ stop: stops[0]!.stop }])).toBeUndefined();
  });
});

describe("polyline", () => {
  it("decodes the Google example", () => {
    expect(decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")).toEqual([
      [38.5, -120.2],
      [40.7, -120.95],
      [43.252, -126.453],
    ]);
  });
});

describe("running days", () => {
  it("decodes the bitmap", () => {
    expect(runningDays("C", "20251214")).toEqual(["2025-12-14", "2025-12-15"]);
    expect(runningDays("0001", "20251229")).toEqual(["2026-01-13"]);
  });
});

describe("client against fixtures", () => {
  it("locations", async () => {
    const { client } = fixtureClient();
    const locs = await client.locations("Linz");
    expect(locs[0]).toMatchObject({ id: "8100013", name: "Linz/Donau Hbf", type: "station" });
    expect(locs[0]!.lat).toBeCloseTo(48.29, 1);
  });
  it("nearby", async () => {
    const { client } = fixtureClient();
    const locs = await client.nearby(48.185, 16.376);
    expect(locs.length).toBeGreaterThan(0);
    expect(locs[0]!.distance).toBeTypeOf("number");
  });
  it("departures", async () => {
    const { client, calls } = fixtureClient();
    const deps = await client.board("8103000");
    expect(calls[0].svcReqL[0].req.stbLoc.lid).toBe("A=1@L=8103000@");
    expect(deps.length).toBeGreaterThan(5);
    const d = deps[0]!;
    expect(d.journeyId).toMatch(/^2\|/);
    expect(d.line.name).toBeTruthy();
    expect(d.when.planned).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:00\+0[12]:00$/);
    expect(deps.some((x) => x.when.delay !== undefined)).toBe(true);
    expect(deps.some((x) => x.when.platform)).toBe(true);
  });
  it("takes train numbers from the name when JourneyGeoPos omits num", async () => {
    const { client } = fixtureClient();
    const mv = await client.radar({ north: 48.3, west: 16.2, south: 48.1, east: 16.5 });
    for (const m of mv) {
      if (!m.line.trainNumber && /^[A-Z]+$/.test(m.line.category))
        expect(m.line.name).toMatch(/\d/);
    }
  });
  it("keeps the train number of S-Bahn lines", async () => {
    const { client } = fixtureClient();
    const deps = await client.board("8103000");
    const s = deps.find((d) => d.line.name === "S 2");
    expect(s?.line).toMatchObject({ number: "2", trainNumber: "22734" });
  });
  it("replaces the ÖBB placeholder operator", async () => {
    const { client } = fixtureClient();
    const deps = await client.board("8103000");
    expect(deps.some((d) => d.line.operator === "Nahreisezug")).toBe(false);
    expect(deps.find((d) => d.line.name === "EC 140")?.line.operator).toBe("ÖBB");
    expect(deps.find((d) => d.line.name.startsWith("Tram"))?.line.operator).toMatch(
      /Wiener Linien/,
    );
  });
  it("arrivals", async () => {
    const { client } = fixtureClient();
    const arrs = await client.board("8100002", { arrivals: true });
    expect(arrs.length).toBeGreaterThan(0);
  });
  it("journeys", async () => {
    const { client } = fixtureClient();
    const r = await client.journeys("8103000", "8100173");
    expect(r.journeys.length).toBeGreaterThan(0);
    expect(r.laterRef).toBeTruthy();
    const j = r.journeys[0]!;
    expect(j.recon).toBeTruthy();
    expect(j.legs[0]!.kind).toBe("journey");
    expect(j.legs[0]!.origin.id).toBe("8103000");
    expect(j.legs[0]!.stopovers!.length).toBeGreaterThan(2);
    expect(j.duration).toBeGreaterThan(60);
    expect(
      r.journeys.flatMap((x) => x.legs).some((l) => l.polyline && l.polyline.length > 10),
    ).toBe(true);
  });
  it("reconstruction", async () => {
    const { client } = fixtureClient();
    const j = await client.refreshJourney("x");
    expect(j?.legs.length).toBeGreaterThan(0);
  });
  it("trip", async () => {
    const { client } = fixtureClient();
    const t = await client.trip("2|x");
    expect(t.stopovers.length).toBeGreaterThan(2);
    expect(t.stopovers[0]!.dep).toBeTruthy();
    expect(t.stopovers.at(-1)!.arr).toBeTruthy();
    expect(t.polyline?.length).toBeGreaterThan(10);
    expect(t.polyline![0]![0]).toBeGreaterThan(45);
    expect(t.runningDays).toBeTruthy();
  });
  it("tripsByName", async () => {
    const { client } = fixtureClient();
    const m = await client.tripsByName("RJX 162");
    expect(m[0]).toMatchObject({ line: { category: "RJX", number: "162", product: "highspeed" } });
    expect(m[0]!.origin?.name).toBe("Budapest-Keleti");
  });
  it("radar", async () => {
    const { client } = fixtureClient();
    const mv = await client.radar({ north: 48.3, west: 16.2, south: 48.1, east: 16.5 });
    expect(mv.length).toBeGreaterThan(0);
    expect(mv[0]!.lat).toBeGreaterThan(48);
    // fixture recorded with realtime data: delays are derived for the trains
    expect(mv.some((m) => m.delay !== undefined)).toBe(true);
  });
  it("warnings", async () => {
    const { client } = fixtureClient();
    const w = await client.warnings();
    expect(w.length).toBeGreaterThan(0);
    expect(w[0]!.title).toBeTruthy();
  });
  it("caches identical requests", async () => {
    const { client, calls } = fixtureClient();
    await client.locations("Linz");
    await client.locations("Linz");
    expect(calls.length).toBe(1);
  });
});

describe("dirGeo", () => {
  it("is counter-clockwise from east in 32 steps, as a compass bearing", () => {
    expect(dirGeoBearing(0)).toBe(90); // east
    expect(dirGeoBearing(8)).toBe(0); // north
    expect(dirGeoBearing(16)).toBe(270); // west
    expect(dirGeoBearing(24)).toBe(180); // south
    expect(dirGeoBearing(21)).toBe(213.75);
    expect(dirGeoBearing(undefined)).toBeUndefined();
  });

  it("matches the direction from the previous to the next stop in the recorded radar data", async () => {
    const res = fixture("journey-geo-pos").response;
    const r = res.svcResL[0].res;
    const locs = r.common.locL;
    const errs: number[] = [];
    for (const j of r.jnyL) {
      const f = locs[j.ani.fLocX[0]].crd;
      const t = locs[j.ani.tLocX[0]].crd;
      const dx = (t.x - f.x) * Math.cos((48.2 * Math.PI) / 180);
      const dy = t.y - f.y;
      if (!dx && !dy) continue;
      const stops = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
      const d = Math.abs(dirGeoBearing(j.dirGeo)! - stops) % 360;
      errs.push(Math.min(d, 360 - d));
    }
    expect(errs.length).toBeGreaterThan(30);
    expect(Math.max(...errs)).toBeLessThan(20);
  });
});
