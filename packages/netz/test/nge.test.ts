import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { buildNetz } from "../src/netz.ts";
import { consistentTravel, layoutNodes, toNge, type NgeDto } from "../src/nge.ts";
import { feed, lineStations, trip } from "./helpers.ts";

const has = (o: unknown, keys: string[]) => {
  for (const k of keys) expect(o, `missing ${k}`).toHaveProperty(k);
};

/**
 * Structural validation against NGE's NetzgrafikDto
 * (business.data.structures.ts / technical.data.structures.ts) and the
 * invariants its 3rd-party JSON import relies on.
 */
function validateNge(dto: NgeDto) {
  // EditorToolsViewComponent.onLoad checks exactly these top-level keys
  has(dto, ["nodes", "trainrunSections", "trainruns", "resources", "metadata"]);
  has(dto, ["freeFloatingTexts", "labels", "labelGroups", "filterData"]);
  has(dto.metadata, [
    "trainrunCategories",
    "trainrunFrequencies",
    "trainrunTimeCategories",
    "netzgrafikColors",
    "analyticsSettings",
  ]);
  expect(dto.filterData.filterSettings).toEqual([]);

  const nodeIds = new Set<number>();
  const bp = new Set<string>();
  for (const n of dto.nodes) {
    has(n, [
      "id",
      "betriebspunktName",
      "fullName",
      "positionX",
      "positionY",
      "ports",
      "transitions",
      "connections",
      "resourceId",
      "perronkanten",
      "connectionTime",
      "trainrunCategoryHaltezeiten",
      "symmetryAxis",
      "warnings",
      "labelIds",
    ]);
    // 3rd-party detection: every node has empty ports
    expect(n.ports).toEqual([]);
    expect(n.transitions).toEqual([]);
    expect(Number.isFinite(n.positionX) && Number.isFinite(n.positionY)).toBe(true);
    has(n.trainrunCategoryHaltezeiten, [
      "HaltezeitIPV",
      "HaltezeitA",
      "HaltezeitB",
      "HaltezeitC",
      "HaltezeitD",
      "HaltezeitUncategorized",
    ]);
    nodeIds.add(n.id);
    // NodeService.mergeNodes matches on betriebspunktName → must be unique
    expect(bp.has(n.betriebspunktName)).toBe(false);
    bp.add(n.betriebspunktName);
  }

  const catIds = new Set(dto.metadata.trainrunCategories.map((c) => c.id));
  for (const c of dto.metadata.trainrunCategories) {
    has(c, [
      "id",
      "order",
      "name",
      "shortName",
      "fachCategory",
      "colorRef",
      "minimalTurnaroundTime",
      "nodeHeadwayStop",
      "nodeHeadwayNonStop",
      "sectionHeadway",
    ]);
  }
  for (const f of dto.metadata.trainrunFrequencies) {
    has(f, ["id", "order", "frequency", "offset", "name", "shortName", "linePatternRef"]);
  }
  for (const t of dto.metadata.trainrunTimeCategories) {
    has(t, ["id", "order", "name", "shortName", "dayTimeInterval", "weekday", "linePatternRef"]);
  }
  const freqIds = new Set(dto.metadata.trainrunFrequencies.map((f) => f.id));
  const timeIds = new Set(dto.metadata.trainrunTimeCategories.map((t) => t.id));
  const labelIds = new Set(dto.labels.map((l) => l.id));
  const groupIds = new Set(dto.labelGroups.map((g) => g.id));
  for (const l of dto.labels) expect(groupIds.has(l.labelGroupId)).toBe(true);

  const trIds = new Set<number>();
  for (const t of dto.trainruns) {
    has(t, [
      "id",
      "name",
      "categoryId",
      "frequencyId",
      "trainrunTimeCategoryId",
      "labelIds",
      "direction",
    ]);
    expect(catIds.has(t.categoryId)).toBe(true);
    expect(freqIds.has(t.frequencyId)).toBe(true);
    expect(timeIds.has(t.trainrunTimeCategoryId)).toBe(true);
    for (const l of t.labelIds) expect(labelIds.has(l)).toBe(true);
    expect(["round_trip", "one_way"]).toContain(t.direction);
    trIds.add(t.id);
  }

  const byTrainrun = new Map<number, NgeDto["trainrunSections"]>();
  const sectionIds = new Set<number>();
  for (const s of dto.trainrunSections) {
    has(s, [
      "id",
      "sourceNodeId",
      "sourcePortId",
      "targetNodeId",
      "targetPortId",
      "sourceSymmetry",
      "targetSymmetry",
      "sourceArrival",
      "sourceDeparture",
      "targetArrival",
      "targetDeparture",
      "travelTime",
      "backwardTravelTime",
      "numberOfStops",
      "trainrunId",
      "resourceId",
      "specificTrainrunSectionFrequencyId",
      "warnings",
    ]);
    expect(sectionIds.has(s.id)).toBe(false);
    sectionIds.add(s.id);
    expect(nodeIds.has(s.sourceNodeId) && nodeIds.has(s.targetNodeId)).toBe(true);
    expect(s.sourceNodeId).not.toBe(s.targetNodeId);
    expect(trIds.has(s.trainrunId)).toBe(true);
    for (const k of [
      "sourceArrival",
      "sourceDeparture",
      "targetArrival",
      "targetDeparture",
    ] as const) {
      has(s[k], ["time", "consecutiveTime", "lock"]);
      expect(s[k].time).toBeGreaterThanOrEqual(0);
      expect(s[k].time).toBeLessThan(60);
    }
    expect(s.travelTime.time).toBeGreaterThan(0);
    expect(s.backwardTravelTime.time).toBeGreaterThan(0);
    // NGE's validator: departure + travel time ≡ arrival (mod 60), both directions
    expect((s.sourceDeparture.time + s.travelTime.time - s.targetArrival.time) % 60).toBe(0);
    expect((s.targetDeparture.time + s.backwardTravelTime.time - s.sourceArrival.time) % 60).toBe(
      0,
    );
    let list = byTrainrun.get(s.trainrunId);
    if (!list) byTrainrun.set(s.trainrunId, (list = []));
    list.push(s);
  }
  // sections of a trainrun form one chain in travel order without revisiting a node
  for (const [, list] of byTrainrun) {
    const visited = new Set([list[0]!.sourceNodeId]);
    for (let i = 0; i < list.length; i++) {
      if (i > 0) expect(list[i]!.sourceNodeId).toBe(list[i - 1]!.targetNodeId);
      expect(visited.has(list[i]!.targetNodeId)).toBe(false);
      visited.add(list[i]!.targetNodeId);
    }
  }
  const num = (a: number, b: number) => a - b;
  expect([...byTrainrun.keys()].sort(num)).toEqual([...trIds].sort(num));
}

describe("NGE export", () => {
  const stations = lineStations(["X", "Y", "Z"], [30, 30]);
  const trips = [];
  for (let h = 6; h <= 20; h++) {
    const t = h * 60;
    trips.push(
      trip("RJX", String(2 * h), [
        ["X", t + 10, t + 10, 0],
        ["Y", t + 30, t + 32, 30],
        ["Z", t + 58, t + 58, 60],
      ]),
      trip("RJX", String(2 * h + 1), [
        ["Z", t + 2, t + 2, 0],
        ["Y", t + 28, t + 30, 30],
        ["X", t + 50, t + 50, 60],
      ]),
    );
  }
  const model = buildNetz(feed(stations, trips), {
    day: "2026-03-10",
    source: "test",
    cats: ["RJX"],
    nodes: ["X", "Y", "Z"].map((id) => ({ id, code: id })),
  });
  const dto = toNge(model);

  it("produces a structurally valid NetzgrafikDto", () => {
    validateNge(dto);
    expect(dto.trainruns).toEqual([
      {
        id: 0,
        name: "X–Z",
        categoryId: 0,
        frequencyId: 3,
        trainrunTimeCategoryId: 0,
        labelIds: [1],
        direction: "round_trip",
      },
    ]);
  });

  it("maps line minutes onto section times", () => {
    const [xy, yz] = dto.trainrunSections;
    expect(xy).toMatchObject({
      sourceNodeId: 0,
      targetNodeId: 1,
      sourceDeparture: { time: 10 },
      targetArrival: { time: 30 },
      targetDeparture: { time: 30 },
      sourceArrival: { time: 50 },
      travelTime: { time: 20 },
      backwardTravelTime: { time: 20 },
      sourceSymmetry: true,
      targetSymmetry: true,
    });
    expect(yz).toMatchObject({ sourceDeparture: { time: 32 }, targetArrival: { time: 58 } });
  });

  it("fixes travel times to be consistent modulo 60", () => {
    expect(consistentTravel(10, 31, 20)).toBe(21);
    expect(consistentTravel(50, 5, 75)).toBe(75);
    expect(consistentTravel(50, 4, 75)).toBe(74);
  });

  it("pushes overlapping nodes apart and snaps to the grid", () => {
    const p = layoutNodes([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 100, y: 100 },
    ]);
    expect(Math.hypot(p[0]!.x - p[1]!.x, p[0]!.y - p[1]!.y)).toBeGreaterThanOrEqual(192);
    for (const q of p) expect(q.x % 32 === 0 && q.y % 32 === 0).toBe(true);
  });

  const generated = join(import.meta.dirname, "..", "data", "nge.json");
  it.skipIf(!existsSync(generated))("validates the generated data/nge.json", () => {
    validateNge(JSON.parse(readFileSync(generated, "utf8")) as NgeDto);
  });
});
