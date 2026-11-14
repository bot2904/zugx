import { describe, expect, it } from "vite-plus/test";
import { GRID, nodeSizes, schematicLayout, type SchematicEdge } from "../src/schematic.ts";

const overlaps = (n: { x: number; y: number; w: number; h: number }[]) => {
  const out: [number, number][] = [];
  for (let i = 0; i < n.length; i++)
    for (let j = i + 1; j < n.length; j++) {
      const [a, b] = [n[i]!, n[j]!];
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h)
        out.push([i, j]);
    }
  return out;
};

describe("schematic layout", () => {
  it("sizes nodes like NGE: 32 px per port on a side", () => {
    const edges: SchematicEdge[] = [
      { a: 0, b: 1, n: 5 },
      { a: 0, b: 2, n: 4 },
    ];
    const s = nodeSizes(3, edges, ["h", "v"], (e) =>
      e.b === 1 ? { dx: 1, dy: 0 } : { dx: 0, dy: 1 },
    );
    expect(s[0]).toEqual({ w: 4 * 32, h: 5 * 32 + 28 }); // 5 ports right, 4 ports bottom
    expect(s[1]).toEqual({ w: 96, h: 5 * 32 + 28 });
    expect(s[2]).toEqual({ w: 4 * 32, h: 64 });
  });

  it("makes roughly horizontal/vertical connections exact, keeping their order", () => {
    // km: B east of A (slightly north), C south of A (slightly west)
    const { nodes, axes } = schematicLayout(
      [
        { x: 0, y: 0 },
        { x: 50, y: -8 },
        { x: -6, y: 40 },
      ],
      [
        { a: 0, b: 1, n: 3 },
        { a: 0, b: 2, n: 2 },
      ],
    );
    expect(axes).toEqual(["h", "v"]);
    const [a, b, c] = nodes as [(typeof nodes)[0], (typeof nodes)[0], (typeof nodes)[0]];
    expect(b.y).toBe(a.y);
    expect(b.x).toBeGreaterThanOrEqual(a.x + a.w + 192); // room for the time labels
    expect(c.x).toBe(a.x);
    expect(c.y).toBeGreaterThanOrEqual(a.y + a.h + 192);
    for (const q of nodes) expect(q.x % GRID === 0 && q.y % GRID === 0).toBe(true);
  });

  it("spreads a dense cluster without overlaps", () => {
    // a station hub with five neighbours within 2 km, heavily connected
    const pts = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: -1, y: 0.2 },
      { x: 0.2, y: 1 },
      { x: 0, y: -1 },
      { x: 1, y: 1 },
    ];
    const edges = [1, 2, 3, 4, 5].map((b) => ({ a: 0, b, n: 8 }));
    const { nodes } = schematicLayout(pts, edges);
    expect(overlaps(nodes)).toEqual([]);
  });

  it("falls back when a connection can't be straight (cycle of order constraints)", () => {
    // triangle: A–B horizontal, B–C vertical, C–A would need both nodes in one row and order
    const { nodes, axes } = schematicLayout(
      [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 40 },
      ],
      [
        { a: 0, b: 1, n: 2 },
        { a: 1, b: 2, n: 2 },
        { a: 2, b: 0, n: 1 },
      ],
    );
    expect(axes.slice(0, 2)).toEqual(["h", "v"]);
    expect(axes[2]).toBe("free");
    expect(overlaps(nodes)).toEqual([]);
  });
});
