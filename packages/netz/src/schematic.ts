/**
 * Schematic layout for the Netzgrafik-Editor export: stations near their geographic position,
 * but on NGE's 32 px grid, with connections running exactly horizontally or vertically wherever
 * possible, like hand-drawn Netzgrafiken (SBB style).
 *
 * NGE details the layout plans for (netzgrafik-editor-frontend):
 * - positions are the top-left corners of the node boxes;
 * - each trainrun section gets one port per end, on the side facing the other node: top/bottom
 *   if |dy| > |dx| between the two top-left corners, else left/right (`VisAVisPortPlacement`);
 *   ports are stacked from the top-left corner, so nodes in one row (equal y) get straight lines;
 * - a node is 32 px wide per port on its top/bottom side (min 96) and 32 px high per port on its
 *   left/right side plus a 28 px title (min 64) (`Node.getNodeWidth/getNodeHeight`).
 *
 * Method (orthogonal compaction with geographic lower bounds):
 * 1. every connection is horizontal or vertical (by its geographic angle, heaviest first): a
 *    horizontal one puts both nodes into one row (same y) and orders them left→right with room
 *    for the time labels; vertical ones likewise for columns. A connection that would contradict
 *    the constraints so far (a cycle) tries the other axis, else stays free (drawn diagonally);
 * 2. node sizes follow from the resulting port sides;
 * 3. coordinates per axis: each row/column gets the maximum of its geographic position and what
 *    its predecessors require (longest path), so geography holds where there is room and dense
 *    areas (Vienna) are spread out;
 * 4. remaining overlaps add separation constraints, then 3. again, until there are none.
 */

export const GRID = 32;
const PIN = 32;
const MIN_W = 96;
const MIN_H = 64;
const TITLE = 28;

export interface SchematicEdge {
  a: number;
  b: number;
  /** trainrun sections between a and b (= ports on each end) */
  n: number;
}

export interface SchematicOptions {
  /** pixels per km for the geographic lower bounds */
  scale?: number;
  /** minimal free space between two connected nodes (time and name labels) */
  gap?: number;
  /** minimal free space between unconnected nodes */
  margin?: number;
}

export type Axis = "h" | "v" | "free";

export interface SchematicNode {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** union-find over node indexes */
class Groups {
  private p: number[];
  constructor(n: number) {
    this.p = Array.from({ length: n }, (_, i) => i);
  }
  find(i: number): number {
    while (this.p[i] !== i) i = this.p[i] = this.p[this.p[i]!]!;
    return i;
  }
  union(a: number, b: number) {
    this.p[this.find(a)] = this.find(b);
  }
}

/** "node b at least `d` px after node a" on one axis */
interface Constraint {
  a: number;
  b: number;
  /** extra distance after a's box (gap or margin); the box extent is added when solving */
  d: number;
}

/** one axis: rows (for y) or columns (for x) plus ordering constraints */
class AxisSystem {
  groups: Groups;
  cons: Constraint[] = [];
  constructor(n: number) {
    this.groups = new Groups(n);
  }
  /** is group(to) reachable from group(from) via constraints? */
  reaches(from: number, to: number): boolean {
    const target = this.groups.find(to);
    const adj = new Map<number, number[]>();
    for (const c of this.cons) {
      const ga = this.groups.find(c.a);
      const l = adj.get(ga) ?? [];
      l.push(this.groups.find(c.b));
      adj.set(ga, l);
    }
    const seen = new Set<number>();
    const stack = [this.groups.find(from)];
    while (stack.length) {
      const g = stack.pop()!;
      if (g === target) return true;
      if (seen.has(g)) continue;
      seen.add(g);
      stack.push(...(adj.get(g) ?? []));
    }
    return false;
  }
  canMerge(a: number, b: number) {
    return (
      this.groups.find(a) === this.groups.find(b) || (!this.reaches(a, b) && !this.reaches(b, a))
    );
  }
  canOrder(a: number, b: number) {
    return this.groups.find(a) !== this.groups.find(b) && !this.reaches(b, a);
  }
  /** coordinates: max(lower bound, predecessors + extent + d), in topological order */
  solve(lower: number[], extent: number[]): number[] {
    const n = lower.length;
    const g = (i: number) => this.groups.find(i);
    const coord = new Map<number, number>();
    for (let i = 0; i < n; i++) coord.set(g(i), Math.max(coord.get(g(i)) ?? -Infinity, lower[i]!));
    // Bellman-Ford style relaxation (the constraint graph is acyclic by construction)
    for (let iter = 0; iter <= n; iter++) {
      let changed = false;
      for (const c of this.cons) {
        const need = coord.get(g(c.a))! + extent[c.a]! + c.d;
        if (need > coord.get(g(c.b))!) {
          coord.set(g(c.b), need);
          changed = true;
        }
      }
      if (!changed) break;
    }
    return Array.from({ length: n }, (_, i) => coord.get(g(i))!);
  }
}

const up = (v: number) => Math.ceil(v / GRID) * GRID;
const round = (v: number) => Math.round(v / GRID) * GRID;

/** Node sizes in NGE for the given edge axes and the (geographic or final) relative positions. */
export function nodeSizes(
  count: number,
  edges: SchematicEdge[],
  axes: Axis[],
  rel: (e: SchematicEdge) => { dx: number; dy: number },
) {
  const ports = Array.from({ length: count }, () => ({ top: 0, bottom: 0, left: 0, right: 0 }));
  edges.forEach((e, i) => {
    const { dx, dy } = rel(e);
    const vertical = axes[i] === "v" || (axes[i] === "free" && Math.abs(dx) < Math.abs(dy));
    if (vertical) {
      ports[e.a]![dy > 0 ? "bottom" : "top"] += e.n;
      ports[e.b]![dy > 0 ? "top" : "bottom"] += e.n;
    } else {
      ports[e.a]![dx > 0 ? "right" : "left"] += e.n;
      ports[e.b]![dx > 0 ? "left" : "right"] += e.n;
    }
  });
  return ports.map((p) => ({
    w: Math.max(MIN_W, Math.max(p.top, p.bottom) * PIN),
    h: Math.max(MIN_H, Math.max(p.left, p.right) * PIN + TITLE),
  }));
}

/** Top-left corners (px, on the grid) and sizes of the NGE nodes, plus the axis of each edge. */
export function schematicLayout(
  pts: { x: number; y: number }[],
  edges: SchematicEdge[],
  { scale = 6, gap = 192, margin = 64 }: SchematicOptions = {},
): { nodes: SchematicNode[]; axes: Axis[] } {
  const n = pts.length;
  const geo = pts.map((p) => ({ x: p.x * scale, y: p.y * scale }));
  const X = new AxisSystem(n);
  const Y = new AxisSystem(n);
  const axes: Axis[] = edges.map(() => "free");
  // stable order: heaviest connections first, then by index
  const order = edges.map((_, i) => i).sort((i, j) => edges[j]!.n - edges[i]!.n || i - j);
  const sign = (v: number, tie: number) => (v > 0 ? 1 : v < 0 ? -1 : tie);

  // 1. axes: equal rows/columns + order along the edge (distances filled in after sizing)
  const ordered: { e: number; sys: AxisSystem; a: number; b: number }[] = [];
  for (const i of order) {
    const e = edges[i]!;
    const dx = geo[e.b]!.x - geo[e.a]!.x;
    const dy = geo[e.b]!.y - geo[e.a]!.y;
    const tryAxis = (axis: "h" | "v") => {
      const [same, along, d] = axis === "h" ? [Y, X, dx] : [X, Y, dy];
      const s = sign(d, e.a < e.b ? 1 : -1);
      const [a, b] = s > 0 ? [e.a, e.b] : [e.b, e.a];
      if (!same.canMerge(e.a, e.b) || !along.canOrder(a, b)) return false;
      // no other station of the joined row/column between the two ends (the line would cross it)
      const ga = same.groups.find(e.a);
      const gb = same.groups.find(e.b);
      const pos = (k: number) => (axis === "h" ? geo[k]!.x : geo[k]!.y);
      const [lo, hi] = [Math.min(pos(e.a), pos(e.b)), Math.max(pos(e.a), pos(e.b))];
      for (let k = 0; k < n; k++) {
        if (k === e.a || k === e.b) continue;
        const gk = same.groups.find(k);
        if ((gk === ga || gk === gb) && pos(k) > lo && pos(k) < hi) return false;
      }
      // merging rows must not put two already ordered nodes into one column, etc.
      same.groups.union(e.a, e.b);
      along.cons.push({ a, b, d: 0 });
      ordered.push({ e: i, sys: along, a, b });
      axes[i] = axis;
      return true;
    };
    const first = Math.abs(dx) >= Math.abs(dy) ? "h" : "v";
    if (!tryAxis(first)) tryAxis(first === "h" ? "v" : "h");
  }

  // 2. sizes from the port sides
  const size = nodeSizes(n, edges, axes, (e) => ({
    dx: geo[e.b]!.x - geo[e.a]!.x,
    dy: geo[e.b]!.y - geo[e.a]!.y,
  }));
  const w = size.map((s) => s.w);
  const h = size.map((s) => s.h);
  for (const o of ordered) {
    const c = o.sys.cons.find((k) => k.a === o.a && k.b === o.b && k.d === 0);
    if (c) c.d = gap;
  }
  // free (diagonal) connections: keep their geographic order on both axes if possible
  edges.forEach((e, i) => {
    if (axes[i] !== "free") return;
    const dx = geo[e.b]!.x - geo[e.a]!.x;
    const dy = geo[e.b]!.y - geo[e.a]!.y;
    for (const [sys, d] of [
      [X, dx],
      [Y, dy],
    ] as const) {
      const [a, b] = d >= 0 ? [e.a, e.b] : [e.b, e.a];
      if (sys.canOrder(a, b)) sys.cons.push({ a, b, d: gap / 2 });
    }
  });

  // 3./4. solve, then separate overlapping nodes until there are none
  const lowerX = geo.map((g, i) => round(g.x - w[i]! / 2));
  const lowerY = geo.map((g, i) => round(g.y - h[i]! / 2));
  let xs: number[] = [];
  let ys: number[] = [];
  for (let round_ = 0; round_ < 200; round_++) {
    xs = X.solve(lowerX, w).map(up);
    ys = Y.solve(lowerY, h).map(up);
    let added = false;
    for (let i = 0; i < n && !added; i++) {
      for (let j = i + 1; j < n; j++) {
        const ox = Math.min(xs[i]! + w[i]!, xs[j]! + w[j]!) + margin - Math.max(xs[i]!, xs[j]!);
        const oy = Math.min(ys[i]! + h[i]!, ys[j]! + h[j]!) + margin - Math.max(ys[i]!, ys[j]!);
        if (ox <= 0 || oy <= 0) continue;
        // separate along the axis where they are already further apart (geographically)
        const gdx = geo[j]!.x - geo[i]!.x;
        const gdy = geo[j]!.y - geo[i]!.y;
        const options: [AxisSystem, number][] =
          Math.abs(gdx) >= Math.abs(gdy)
            ? [
                [X, gdx],
                [Y, gdy],
              ]
            : [
                [Y, gdy],
                [X, gdx],
              ];
        for (const [sys, d] of options) {
          const [a, b] = d >= 0 ? [i, j] : [j, i];
          if (sys.canOrder(a, b)) {
            sys.cons.push({ a, b, d: margin });
            added = true;
            break;
          }
        }
        if (added) break;
      }
    }
    if (!added) break;
  }
  return {
    nodes: xs.map((x, i) => ({ x, y: ys[i]!, w: w[i]!, h: h[i]! })),
    axes,
  };
}
