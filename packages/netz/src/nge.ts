/**
 * Export of the Netzgrafik model to the JSON format of SBB's Netzgrafik-Editor
 * (NGE, https://github.com/OpenRailAssociation/netzgrafik-editor-frontend),
 * `NetzgrafikDto` in `src/app/data-structures/business.data.structures.ts`.
 *
 * We emit the "3rd-party" flavour that NGE's JSON import explicitly supports:
 * all nodes have empty `ports`/`transitions`/`connections` and trainrun
 * sections are listed per trainrun in travel order. On import NGE then creates
 * ports, transitions (nonstop where arrival = departure minute), resources and
 * edge routing itself (`EditorToolsViewComponent.processNetzgrafikJSON3rdParty`).
 */
import { mod } from "./takt.ts";
import type { LineDirection, LineStop, NetzModel } from "./types.ts";

// ---- DTO subset (field names as in NGE) ---------------------------------

export interface TimeLockDto {
  time: number;
  consecutiveTime: number;
  lock: boolean;
}

export interface HaltezeitDto {
  haltezeit: number;
  no_halt: boolean;
}

export interface NgeNodeDto {
  id: number;
  betriebspunktName: string;
  fullName: string;
  positionX: number;
  positionY: number;
  ports: unknown[];
  transitions: unknown[];
  connections: unknown[];
  resourceId: number;
  perronkanten: number;
  connectionTime: number;
  trainrunCategoryHaltezeiten: Record<string, HaltezeitDto>;
  symmetryAxis: number | null;
  warnings: null;
  labelIds: number[];
}

export interface NgeTrainrunDto {
  id: number;
  name: string;
  categoryId: number;
  frequencyId: number;
  trainrunTimeCategoryId: number;
  labelIds: number[];
  direction: "round_trip" | "one_way";
}

export interface NgeTrainrunSectionDto {
  id: number;
  sourceNodeId: number;
  sourcePortId: number;
  targetNodeId: number;
  targetPortId: number;
  sourceSymmetry: boolean;
  targetSymmetry: boolean;
  sourceArrival: TimeLockDto;
  sourceDeparture: TimeLockDto;
  targetArrival: TimeLockDto;
  targetDeparture: TimeLockDto;
  travelTime: TimeLockDto;
  backwardTravelTime: TimeLockDto;
  numberOfStops: number;
  trainrunId: number;
  resourceId: number;
  specificTrainrunSectionFrequencyId: number | null;
  warnings: unknown[];
  // `path` omitted on purpose: NGE fills its default and routes the edge on import
}

export interface NgeTrainrunCategory {
  id: number;
  order: number;
  name: string;
  shortName: string;
  fachCategory: string;
  colorRef: string;
  minimalTurnaroundTime: number;
  nodeHeadwayStop: number;
  nodeHeadwayNonStop: number;
  sectionHeadway: number;
}

export interface NgeDto {
  nodes: NgeNodeDto[];
  trainrunSections: NgeTrainrunSectionDto[];
  trainruns: NgeTrainrunDto[];
  resources: { id: number; capacity: number }[];
  metadata: {
    analyticsSettings: { originDestinationSettings: { connectionPenalty: number } };
    trainrunCategories: NgeTrainrunCategory[];
    trainrunFrequencies: {
      id: number;
      order: number;
      frequency: number;
      offset: number;
      shortName: string;
      name: string;
      linePatternRef: string;
    }[];
    trainrunTimeCategories: {
      id: number;
      order: number;
      shortName: string;
      name: string;
      dayTimeInterval: { from: number; to: number }[];
      weekday: number[];
      linePatternRef: string;
    }[];
    netzgrafikColors: Record<string, string | number>[];
    orderingAlgorithm: number;
    trafficSide: "leftHand" | "rightHand";
  };
  freeFloatingTexts: {
    id: number;
    x: number;
    y: number;
    width: number;
    height: number;
    title: string;
    text: string;
    backgroundColor: string;
    textColor: string;
    labelIds: number[];
  }[];
  labels: { id: number; label: string; labelGroupId: number; labelRef: string }[];
  labelGroups: { id: number; name: string; labelRef: string }[];
  filterData: { filterSettings: unknown[] };
}

// ---- static metadata (NGE defaults, Austrian categories) ----------------

const HALTEZEITEN: Record<string, HaltezeitDto> = {
  HaltezeitIPV: { haltezeit: 3, no_halt: false },
  HaltezeitA: { haltezeit: 2, no_halt: false },
  HaltezeitB: { haltezeit: 2, no_halt: false },
  HaltezeitC: { haltezeit: 1, no_halt: false },
  HaltezeitD: { haltezeit: 1, no_halt: false },
  HaltezeitUncategorized: { haltezeit: 0, no_halt: true },
};

/** ÖBB category → NGE category (colorRef reuses NGE's built-in EC/IC/IR/RE/S colours). */
const CATEGORY_DEFS: [string, string, string, string][] = [
  // shortName, name, colorRef, fachCategory
  ["RJX", "Railjet Xpress", "EC", "HaltezeitIPV"],
  ["RJ", "Railjet", "EC", "HaltezeitIPV"],
  ["ICE", "InterCityExpress", "EC", "HaltezeitIPV"],
  ["EC", "EuroCity", "IC", "HaltezeitA"],
  ["IC", "InterCity", "IC", "HaltezeitA"],
  ["EN", "EuroNight", "IC", "HaltezeitA"],
  ["NJ", "Nightjet", "IC", "HaltezeitA"],
  ["D", "Schnellzug", "IR", "HaltezeitB"],
  ["IR", "InterRegio", "IR", "HaltezeitB"],
  ["CJX", "Cityjet Xpress", "RE", "HaltezeitC"],
  ["REX", "Regionalexpress", "RE", "HaltezeitC"],
  ["R", "Regionalzug", "S", "HaltezeitD"],
  ["S", "S-Bahn", "S", "HaltezeitD"],
];

const FREQUENCIES = [
  [0, 15, 0, "15", "verkehrt viertelstündlich", "15"],
  [1, 20, 0, "20", "verkehrt im 20 Minuten Takt", "20"],
  [2, 30, 0, "30", "verkehrt halbstündlich", "30"],
  [3, 60, 0, "60", "verkehrt stündlich", "60"],
  [4, 120, 0, "120", "verkehrt zweistündlich (gerade)", "120"],
  [5, 120, 60, "120+", "verkehrt zweistündlich (ungerade)", "120"],
] as const;

const TIME_CATEGORIES: NgeDto["metadata"]["trainrunTimeCategories"] = [
  {
    id: 0,
    order: 0,
    shortName: "7/24",
    name: "verkehrt uneingeschränkt",
    dayTimeInterval: [],
    weekday: [1, 2, 3, 4, 5, 6, 7],
    linePatternRef: "7/24",
  },
  {
    id: 1,
    order: 0,
    shortName: "HVZ",
    name: "verkehrt zur Hauptverkehrszeit",
    dayTimeInterval: [
      { from: 360, to: 420 },
      { from: 960, to: 1140 },
    ],
    weekday: [1, 2, 3, 4, 5, 6, 7],
    linePatternRef: "HVZ",
  },
  {
    id: 2,
    order: 0,
    shortName: "zeitweise",
    name: "verkehrt zeitweise",
    dayTimeInterval: [],
    weekday: [],
    linePatternRef: "ZEITWEISE",
  },
];

const NORMAL_COLOR = {
  id: 2,
  colorRef: "NORMAL",
  color: "#767676",
  colorFocus: "#000000",
  colorMuted: "#DCDCDC",
  colorRelated: "#767676",
  colorDarkMode: "#767676",
  colorDarkModeFocus: "#DCDCDC",
  colorDarkModeMuted: "#000000",
  colorDarkModeRelated: "#767676",
};

// ---- layout -------------------------------------------------------------

export interface LayoutOptions {
  /** pixels per km */
  scale?: number;
  /** minimal node distance in pixels */
  minDist?: number;
  /** grid size NGE snaps to */
  grid?: number;
}

/** Projects km coordinates to NGE pixels and pushes overlapping nodes apart. */
export function layoutNodes(
  pts: { x: number; y: number }[],
  { scale = 8, minDist = 224, grid = 32 }: LayoutOptions = {},
) {
  const p = pts.map((q) => ({ x: q.x * scale, y: q.y * scale }));
  for (let iter = 0; iter < 500; iter++) {
    let moved = false;
    for (let i = 0; i < p.length; i++) {
      for (let j = i + 1; j < p.length; j++) {
        const a = p[i]!;
        const b = p[j]!;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d >= minDist) continue;
        if (d < 1e-6) {
          dx = 1;
          dy = 0;
          d = 1;
        }
        const push = (minDist - d) / 2 + 0.5;
        a.x -= (dx / d) * push;
        a.y -= (dy / d) * push;
        b.x += (dx / d) * push;
        b.y += (dy / d) * push;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return p.map((q) => ({ x: Math.round(q.x / grid) * grid, y: Math.round(q.y / grid) * grid }));
}

// ---- sections -----------------------------------------------------------

const lockT = (time: number, consecutiveTime: number): TimeLockDto => ({
  time: mod(Math.round(time), 60),
  consecutiveTime: Math.round(consecutiveTime),
  lock: false,
});

/** travel time adjusted so that dep + travel ≡ arr (mod 60), as NGE requires */
export function consistentTravel(dep: number, arr: number, travel: number): number {
  const diff = mod(arr - dep - travel, 60);
  const adj = diff > 30 ? diff - 60 : diff;
  return Math.max(1, travel + adj);
}

interface Timed {
  dep: number;
  arr: number;
  travel: number;
}

/** Forward minutes per segment of `stops` (missing values filled from neighbours). */
function segmentTimes(dir: LineDirection): Timed[] {
  const out: Timed[] = [];
  for (let i = 0; i + 1 < dir.stops.length; i++) {
    const a = dir.stops[i]!;
    const b = dir.stops[i + 1]!;
    const travel = dir.travel[i] ?? 0;
    const dep = a.dep ?? (b.arr !== null ? b.arr - travel : 0);
    const arr = b.arr ?? dep + travel;
    out.push({ dep, arr, travel: consistentTravel(dep, arr, travel) });
  }
  return out;
}

/** Backward minutes for the forward segment i (from node i+1 to node i). */
function backTimes(fwd: LineStop[], back: LineDirection | undefined, seg: Timed[]) {
  return seg.map((s, i) => {
    const from = fwd[i + 1]!.node;
    const to = fwd[i]!.node;
    if (back) {
      const bi = back.stops.findIndex((x) => x.node === from);
      const bj = back.stops.findIndex((x) => x.node === to);
      if (bi >= 0 && bj === bi + 1) {
        const dep = back.stops[bi]!.dep;
        const arr = back.stops[bj]!.arr;
        const travel = back.travel[bi];
        if (dep !== null && arr !== null && travel !== undefined) {
          return { dep, arr, travel: consistentTravel(dep, arr, travel) };
        }
      }
    }
    // no (matching) opposite direction: mirror symmetrically around :00
    return { dep: mod(-s.arr, 60), arr: mod(-s.dep, 60), travel: s.travel };
  });
}

/** minute of day near "HH:MM" `first` whose minute of the hour is `minute` */
export function startMinute(first: string, minute: number): number {
  const [h = 0, m = 0] = first.split(":").map(Number);
  const f = h * 60 + m;
  let t = h * 60 + mod(minute, 60);
  if (t < f - 30) t += 60;
  if (t > f + 30) t -= 60;
  return t;
}

function frequencyId(dir: LineDirection): number {
  switch (dir.takt) {
    case 15:
      return 0;
    case 30:
      return 2;
    case 120: {
      const h = Number(dir.first.slice(0, 2));
      return h % 2 === 0 ? 4 : 5;
    }
    default:
      return 3;
  }
}

export function toNge(model: NetzModel, layout?: LayoutOptions): NgeDto {
  const nodeIndex = new Map(model.nodes.map((n, i) => [n.id, i]));
  const pos = layoutNodes(model.nodes, layout);
  const nodes: NgeNodeDto[] = model.nodes.map((n, i) => ({
    id: i,
    betriebspunktName: n.code,
    fullName: n.name,
    positionX: pos[i]!.x,
    positionY: pos[i]!.y,
    ports: [],
    transitions: [],
    connections: [],
    resourceId: i + 1,
    perronkanten: 10,
    connectionTime: 5,
    trainrunCategoryHaltezeiten: HALTEZEITEN,
    symmetryAxis: null,
    warnings: null,
    labelIds: [],
  }));

  const usedCats = [...new Set(model.lines.map((l) => l.cat))];
  const catDefs = CATEGORY_DEFS.filter(([s]) => usedCats.includes(s));
  for (const c of usedCats) {
    if (!catDefs.some(([s]) => s === c)) catDefs.push([c, c, "S", "HaltezeitD"]);
  }
  const trainrunCategories: NgeTrainrunCategory[] = catDefs.map(
    ([shortName, name, colorRef, fach], i) => ({
      id: i,
      order: i,
      shortName,
      name,
      colorRef,
      fachCategory: fach,
      minimalTurnaroundTime: 4,
      nodeHeadwayStop: 2,
      nodeHeadwayNonStop: 2,
      sectionHeadway: 2,
    }),
  );
  const catId = new Map(trainrunCategories.map((c) => [c.shortName, c.id]));
  const labels = trainrunCategories.map((c, i) => ({
    id: i + 1,
    label: c.shortName,
    labelGroupId: 2,
    labelRef: "Trainrun",
  }));

  const trainruns: NgeTrainrunDto[] = [];
  const trainrunSections: NgeTrainrunSectionDto[] = [];
  const code = (id: string) => model.nodes[nodeIndex.get(id)!]?.code ?? id;
  // a round trip needs one frequency for both directions; otherwise two one-way trainruns
  const runs: { cat: string; fwd: LineDirection; back?: LineDirection }[] = [];
  for (const line of model.lines) {
    if (line.back && line.back.takt !== line.fwd.takt) {
      runs.push({ cat: line.cat, fwd: line.fwd }, { cat: line.cat, fwd: line.back });
    } else runs.push(line);
  }
  for (const run of runs) {
    const stops = run.fwd.stops;
    if (stops.some((s) => !nodeIndex.has(s.node))) continue;
    const trId = trainruns.length;
    trainruns.push({
      id: trId,
      name: `${code(stops[0]!.node)}–${code(stops[stops.length - 1]!.node)}`,
      categoryId: catId.get(run.cat)!,
      frequencyId: frequencyId(run.fwd),
      trainrunTimeCategoryId: run.fwd.takt === null ? 2 : 0,
      labelIds: [catId.get(run.cat)! + 1],
      direction: run.back ? "round_trip" : "one_way",
    });
    const seg = segmentTimes(run.fwd);
    const back = backTimes(stops, run.back, seg);
    // consecutive (absolute) minutes, starting at the first train of the day in each direction
    let c = startMinute(run.fwd.first, seg[0]?.dep ?? 0);
    const fwdC = seg.map((s, i) => {
      if (i > 0) c += mod(s.dep - seg[i - 1]!.arr, 60);
      const r = { dep: c, arr: c + s.travel };
      c += s.travel;
      return r;
    });
    let cb = startMinute(run.back?.first ?? run.fwd.first, back[back.length - 1]?.dep ?? 0);
    const backC: { dep: number; arr: number }[] = [];
    for (let i = back.length - 1; i >= 0; i--) {
      const s = back[i]!;
      const next = back[i + 1];
      if (next) cb += mod(s.dep - next.arr, 60);
      backC[i] = { dep: cb, arr: cb + s.travel };
      cb += s.travel;
    }
    seg.forEach((s, i) => {
      const b = back[i]!;
      const id = trainrunSections.length;
      const sourceSym = mod(s.dep + b.arr, 60) === 0;
      const targetSym = mod(s.arr + b.dep, 60) === 0;
      trainrunSections.push({
        id,
        sourceNodeId: nodeIndex.get(stops[i]!.node)!,
        sourcePortId: 2 * id,
        targetNodeId: nodeIndex.get(stops[i + 1]!.node)!,
        targetPortId: 2 * id + 1,
        sourceSymmetry: sourceSym,
        targetSymmetry: targetSym,
        sourceDeparture: lockT(s.dep, fwdC[i]!.dep),
        sourceArrival: lockT(b.arr, backC[i]!.arr),
        targetDeparture: lockT(b.dep, backC[i]!.dep),
        targetArrival: lockT(s.arr, fwdC[i]!.arr),
        // travel times are durations (not minutes of the hour)
        travelTime: { time: s.travel, consecutiveTime: s.travel, lock: true },
        backwardTravelTime: { time: b.travel, consecutiveTime: b.travel, lock: true },
        numberOfStops: 0,
        trainrunId: trId,
        resourceId: 0,
        specificTrainrunSectionFrequencyId: null,
        warnings: [],
      });
    });
  }

  const minX = Math.min(...nodes.map((n) => n.positionX));
  const minY = Math.min(...nodes.map((n) => n.positionY));
  return {
    nodes,
    trainrunSections,
    trainruns,
    resources: nodes.map((n) => ({ id: n.resourceId, capacity: 2 })),
    metadata: {
      analyticsSettings: { originDestinationSettings: { connectionPenalty: 5 } },
      trainrunCategories,
      trainrunFrequencies: FREQUENCIES.map(
        ([id, frequency, offset, shortName, name, linePatternRef]) => ({
          id,
          order: 0,
          frequency,
          offset,
          shortName,
          name,
          linePatternRef,
        }),
      ),
      trainrunTimeCategories: TIME_CATEGORIES,
      netzgrafikColors: [NORMAL_COLOR],
      orderingAlgorithm: 0,
      // ÖBB runs left-hand on double track
      trafficSide: "leftHand",
    },
    freeFloatingTexts: [
      {
        id: 1,
        x: minX,
        y: minY - 192,
        width: 384,
        height: 96,
        title: `zugx Netzgrafik ${model.day}`,
        text: `Reconstructed from ${model.source}. Lines: ${model.lines.length}, categories ${model.cats.join(", ")}.`,
        backgroundColor: "#FFFFFF",
        textColor: "#000000",
        labelIds: [],
      },
    ],
    labels,
    labelGroups: [
      { id: 1, name: "Standard", labelRef: "Node" },
      { id: 2, name: "Kategorie", labelRef: "Trainrun" },
    ],
    filterData: { filterSettings: [] },
  };
}
