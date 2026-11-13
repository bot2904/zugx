import type { Feed, Station, StopTime, Trip } from "../src/gtfs.ts";

/** Stations on a straight east–west line, `km` apart (lat 47, lon from 13). */
export function lineStations(names: string[], kmApart: number[]): Map<string, Station> {
  const m = new Map<string, Station>();
  let km = 0;
  names.forEach((n, i) => {
    if (i > 0) km += kmApart[i - 1]!;
    m.set(n, { id: n, name: n, lat: 47, lon: 13 + km / 75.8 });
  });
  return m;
}

/** A trip from `[station, arr, dep, km]` tuples. */
export function trip(
  cat: string,
  nr: string,
  stops: [string, number, number, number][],
  headsign = stops[stops.length - 1]![0],
): Trip {
  const st: StopTime[] = stops.map(([s, arr, dep, km]) => ({ st: s, arr, dep, dist: km * 1000 }));
  return { id: `${cat}${nr}`, cat, nr, headsign, routeId: "r", stops: st };
}

export function feed(stations: Map<string, Station>, trips: Trip[]): Feed {
  return { stations, trips };
}
