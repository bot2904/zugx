// Journey search on the timetable (Live off): minotor (RAPTOR) on the routing data built by
// `vp run route:build` (public/route: stops.bin, <day>.bin, stations.json) — locally in the
// browser, no HAFAS request. Results are turned into the app's `Journey` type, so the journeys page
// renders them like live results (without delays). Prototype: rail only, the next few days.
import type { Journey, Leg, Location, StopEvent } from "@zugx/hafas";
import { productOf } from "@zugx/hafas";
import { VIENNA } from "./format.ts";
import { stationById } from "./stations.ts";

type Minotor = typeof import("minotor");
type Timetable = import("minotor").Timetable;
type StopsIndex = import("minotor").StopsIndex;
type Stop = NonNullable<ReturnType<StopsIndex["findStopById"]>>;

const BASE = `${import.meta.env.BASE_URL}route/`;

interface Base {
  m: Minotor;
  stops: StopsIndex;
  /** HAFAS station id → GTFS parent station id */
  gtfsOf: Record<string, string>;
  /** GTFS parent station id → HAFAS station id */
  hafasOf: Map<string, string>;
}
let base: Promise<Base> | undefined;
const days = new Map<string, Promise<Timetable | undefined>>();

async function bytes(url: string): Promise<Uint8Array | undefined> {
  const r = await fetch(url);
  if (!r.ok) return undefined;
  return new Uint8Array(await r.arrayBuffer());
}

function loadBase(): Promise<Base> {
  base ??= (async () => {
    const [m, stopsBin, gtfsOf] = await Promise.all([
      import("minotor"),
      bytes(`${BASE}stops.bin`),
      fetch(`${BASE}stations.json`).then((r) => (r.ok ? r.json() : {})) as Promise<
        Record<string, string>
      >,
    ]);
    if (!stopsBin) throw new Error("no timetable routing data (run `vp run route:build`)");
    return {
      m,
      stops: m.StopsIndex.fromData(stopsBin),
      gtfsOf,
      hafasOf: new Map(Object.entries(gtfsOf).map(([h, g]) => [g, h])),
    };
  })();
  return base;
}

function loadDay(m: Minotor, day: string): Promise<Timetable | undefined> {
  let p = days.get(day);
  if (!p) {
    p = bytes(`${BASE}${day}.bin`).then((b) => (b ? m.Timetable.fromData(b) : undefined));
    days.set(day, p);
  }
  return p;
}

export interface TimetableResult {
  journeys: Journey[];
  /** no routing data for that day (only the next few days are built) */
  noData?: boolean;
}

/**
 * Journeys from `from` to `to` (HAFAS station ids) departing in [when, when + window] (default:
 * the rest of the day) —
 * all Pareto-optimal ones (no other leaves later and arrives earlier); with `arrival`, those
 * arriving by `when` (searched in the window before it).
 */
export async function timetableJourneys(
  from: string,
  to: string,
  when: Temporal.ZonedDateTime,
  o: { arrival?: boolean; window?: number; transferTime?: number } = {},
): Promise<TimetableResult> {
  const b = await loadBase();
  const t = when.withTimeZone(VIENNA);
  const day = t.toPlainDate().toString();
  const tt = await loadDay(b.m, day);
  if (!tt) return { journeys: [], noData: true };
  const stopOf = (h: string) => {
    const g = b.gtfsOf[h];
    return g ? b.stops.findStopBySourceStopId(g) : undefined;
  };
  const o1 = stopOf(from);
  const d1 = stopOf(to);
  if (!o1 || !d1) return { journeys: [] };
  const minutes = t.hour * 60 + t.minute;
  // default: the rest of the service day (trips after midnight run until ~03:00) — all
  // Pareto-optimal connections, a few hundred milliseconds
  const window = o.window ?? (o.arrival ? minutes : Math.max(60, 27 * 60 - minutes));
  const [start, end] = o.arrival
    ? [Math.max(0, minutes - window), minutes]
    : [minutes, minutes + window];
  const router = new b.m.Router(tt, b.stops);
  let q = new b.m.RangeQuery.Builder()
    .from(o1.id)
    .to(d1.id)
    .departureTime(start)
    .lastDepartureTime(end)
    .maxTransfers(4);
  if (o.transferTime) q = q.minTransferTime(o.transferTime);
  const result = router.rangeRoute(q.build());
  const midnight = t.startOfDay();
  const iso = (min: number) =>
    midnight.add({ minutes: min }).toString({ timeZoneName: "never", smallestUnit: "second" });
  const location = (s: Stop): Location => {
    const parent = s.parent !== undefined ? b.stops.findStopById(s.parent) : undefined;
    const st = parent ?? s;
    const hafas = st.sourceStopId ? b.hafasOf.get(st.sourceStopId) : undefined;
    return {
      id: hafas ?? st.sourceStopId ?? String(st.id),
      name: (hafas && stationById(hafas)?.name) || st.name,
      type: "station",
      ...(st.lat !== undefined ? { lat: st.lat, lon: st.lon } : {}),
    };
  };
  const ev = (min: number, s: Stop): StopEvent => ({
    planned: iso(min),
    ...(s.platform ? { platform: s.platform, plannedPlatform: s.platform } : {}),
  });
  const journeys: Journey[] = [];
  for (const route of result.routes()) {
    const legs: Leg[] = [];
    for (const l of route.legs) {
      if ("route" in l) {
        const [cat = "", ...rest] = l.route.name.split(" ");
        legs.push({
          kind: "journey",
          origin: location(l.from),
          destination: location(l.to),
          dep: ev(l.departureTime, l.from),
          arr: ev(l.arrivalTime, l.to),
          line: {
            name: l.route.name,
            category: cat,
            number: rest.join(" "),
            cls: 0,
            product: productOf(undefined, cat),
          },
          remarks: [],
        });
      }
    }
    const first = legs[0];
    const last = legs.at(-1);
    if (!first || !last) continue;
    const dep = route.departureTime();
    const arr = route.arrivalTime();
    if (o.arrival && arr > minutes) continue;
    journeys.push({
      legs,
      dep: first.dep,
      arr: last.arr,
      duration: arr - dep,
      transfers: legs.length - 1,
    });
  }
  journeys.sort((a, c) => a.dep.planned.localeCompare(c.dep.planned));
  return { journeys };
}
