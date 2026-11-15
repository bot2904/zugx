// Other lines at a Bildfahrplan node: the station's arrival and departure boards from HAFAS
// (planned times) for the time window, as stops of trains not on the sheet (Stop.ext), so the
// node panel covers every line and operator (also WESTbahn, branch lines …).
import type { BoardEntry, HafasClient } from "@zugx/hafas";
import { RAIL_PRODUCTS, VIENNA } from "@zugx/hafas";
import type { CorridorStation, CorridorTrain } from "@zugx/netz";
import type { Stop } from "./bf-plan.ts";
import { lineKey, minutesOn, normCat, trainKey } from "./bf-live.ts";

async function boardRange(
  client: HafasClient,
  id: string,
  day: string,
  from: number,
  to: number,
  arrivals: boolean,
): Promise<BoardEntry[]> {
  const out: BoardEntry[] = [];
  const at = (m: number) =>
    Temporal.PlainDate.from(day)
      .toZonedDateTime({ timeZone: VIENNA })
      .add({ minutes: Math.round(m) });
  // pages of up to 200 trains (a big station lists every line)
  for (let start = from, page = 0; start < to && page < 5; page++) {
    const b = await client.board(id, {
      when: at(start),
      duration: Math.max(5, Math.round(to - start)),
      results: 200,
      products: RAIL_PRODUCTS & ~2, // no rail replacement buses
      ...(arrivals ? { arrivals: true } : {}),
    });
    out.push(...b);
    if (b.length < 200) break;
    start = minutesOn(day, b.at(-1)!.when.planned) + 1;
  }
  return out;
}

/**
 * Stops of trains at the station that are not among `sheet` (by category + number), arriving or
 * departing in [t0, t1 + maxWait); a train in both boards becomes one stop.
 */
export async function nodeBoardStops(
  client: HafasClient,
  hafasId: string,
  day: string,
  t0: number,
  t1: number,
  sheet: CorridorTrain[],
  maxWait = 60,
): Promise<Stop[]> {
  const [arr, dep] = await Promise.all([
    // arrivals also beyond the window: through trains departing later get their origin
    boardRange(client, hafasId, day, t0, t1 + maxWait, true),
    boardRange(client, hafasId, day, t0, t1 + maxWait, false),
  ]);
  const known = new Set(sheet.map((t) => trainKey(t.cat, t.nr)));
  const byJourney = new Map<string, Stop>();
  const add = (e: BoardEntry, kind: "a" | "d") => {
    if (e.cancelled || !e.when.planned || known.has(lineKey(e.line))) return;
    let s = byJourney.get(e.journeyId);
    if (!s) {
      const t: CorridorTrain = {
        cat: normCat(e.line.category),
        nr: e.line.trainNumber ?? e.line.number,
        dir: 1,
        origin: "",
        headsign: "",
        pts: [],
        days: "",
      };
      s = { t, a: null, d: null, ext: true };
      byJourney.set(e.journeyId, s);
    }
    const m = minutesOn(day, e.when.planned);
    if (kind === "a") {
      s.a = m;
      s.t.origin = e.direction; // arrival boards: where the train comes from
    } else {
      s.d = m;
      s.t.headsign = e.direction;
    }
  };
  for (const e of arr) add(e, "a");
  for (const e of dep) add(e, "d");
  return [...byJourney.values()];
}

/**
 * Trains of other operators on the sheet's own line (e.g. WESTbahn on the Westbahn): direction
 * from the destination / origin — a station of the sheet beyond / before the node, or the
 * destination / origin of the sheet's trains in one direction. These count as sheet directions
 * (`ext` cleared); the rest stay "other lines".
 */
export function assignDirections(
  stops: Stop[],
  stations: CorridorStation[],
  node: number,
  sheet: CorridorTrain[],
): Stop[] {
  const idx = new Map(stations.map((s, k) => [s.name, k]));
  const vote = (m: Map<string, Set<number>>, k: string, d: number) =>
    m.set(k, (m.get(k) ?? new Set()).add(d));
  const toDir = new Map<string, Set<number>>();
  const fromDir = new Map<string, Set<number>>();
  for (const t of sheet) {
    vote(toDir, t.headsign, t.dir);
    vote(fromDir, t.origin, t.dir);
  }
  const unique = (m: Map<string, Set<number>>, k: string) => {
    const s = m.get(k);
    return s?.size === 1 ? ([...s][0] as 1 | -1) : undefined;
  };
  return stops.map((s) => {
    const to = s.t.headsign && idx.get(s.t.headsign);
    const from = s.t.origin && idx.get(s.t.origin);
    const dir =
      (typeof to === "number" && to !== node ? (to > node ? 1 : -1) : undefined) ??
      (s.t.headsign ? unique(toDir, s.t.headsign) : undefined) ??
      (typeof from === "number" && from !== node ? (from < node ? 1 : -1) : undefined) ??
      (s.t.origin ? unique(fromDir, s.t.origin) : undefined);
    return dir ? { ...s, t: { ...s.t, dir }, ext: false } : s;
  });
}
