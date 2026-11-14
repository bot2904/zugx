/**
 * Minimal OSM PBF reader (https://wiki.openstreetmap.org/wiki/PBF_Format): file blocks
 * (zlib), PrimitiveBlocks with dense nodes, nodes, ways and relations. Pure Node (zlib + mapbox
 * `pbf`), so the build needs no osmium/GDAL. Reads the file block by block (constant memory).
 */
import { closeSync, openSync, readSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { PbfReader } from "pbf";

export type Tags = Record<string, string>;
export interface OsmNode {
  type: "node";
  id: number;
  lat: number;
  lon: number;
  tags: Tags;
}
export interface OsmWay {
  type: "way";
  id: number;
  refs: number[];
  tags: Tags;
}
export interface OsmMember {
  type: "node" | "way" | "relation";
  ref: number;
  role: string;
}
export interface OsmRelation {
  type: "relation";
  id: number;
  members: OsmMember[];
  tags: Tags;
}

export interface ReadOptions {
  /** called for every node (also untagged ones of dense blocks) */
  node?: (n: OsmNode) => void;
  /** only nodes with tags are passed to `node` (much faster: untagged coordinates are skipped) */
  taggedNodesOnly?: boolean;
  way?: (w: OsmWay) => void;
  relation?: (r: OsmRelation) => void;
}

const MEMBER_TYPES = ["node", "way", "relation"] as const;

/** Iterate all OSM elements of a .osm.pbf file. */
export function readPbf(path: string, o: ReadOptions): void {
  const fd = openSync(path, "r");
  try {
    const len = Buffer.alloc(4);
    let pos = 0;
    for (;;) {
      if (readSync(fd, len, 0, 4, pos) < 4) break;
      const headerSize = len.readUInt32BE(0);
      const header = Buffer.alloc(headerSize);
      readSync(fd, header, 0, headerSize, pos + 4);
      const { type, dataSize } = blobHeader(header);
      const blob = Buffer.alloc(dataSize);
      readSync(fd, blob, 0, dataSize, pos + 4 + headerSize);
      pos += 4 + headerSize + dataSize;
      if (type !== "OSMData") continue;
      primitiveBlock(blobData(blob), o);
    }
  } finally {
    closeSync(fd);
  }
}

function blobHeader(buf: Buffer) {
  return new PbfReader(buf).readFields(
    (tag, h, p) => {
      if (tag === 1) h.type = p.readString();
      else if (tag === 3) h.dataSize = p.readVarint();
    },
    { type: "", dataSize: 0 },
  );
}

function blobData(buf: Buffer): Uint8Array {
  const b = new PbfReader(buf).readFields((tag, r: { raw?: Uint8Array; zlib?: Uint8Array }, p) => {
    if (tag === 1) r.raw = p.readBytes();
    else if (tag === 3) r.zlib = p.readBytes();
  }, {});
  if (b.raw) return b.raw;
  if (b.zlib) return inflateSync(b.zlib);
  throw new Error("unsupported blob compression (only raw and zlib)");
}

interface Block {
  strings: string[];
  granularity: number;
  latOffset: number;
  lonOffset: number;
  groups: [number, number][]; // [start, end] of each PrimitiveGroup
}

function primitiveBlock(data: Uint8Array, o: ReadOptions) {
  const pbf = new PbfReader(data);
  const b: Block = { strings: [], granularity: 100, latOffset: 0, lonOffset: 0, groups: [] };
  pbf.readFields((tag, blk: Block, p) => {
    if (tag === 1)
      p.readMessage((t, s: string[], q) => {
        if (t === 1) s.push(q.readString());
      }, blk.strings);
    else if (tag === 2) {
      const end = p.readVarint() + p.pos;
      blk.groups.push([p.pos, end]);
      p.pos = end;
    } else if (tag === 17) blk.granularity = p.readVarint();
    else if (tag === 19) blk.latOffset = p.readVarint(true);
    else if (tag === 20) blk.lonOffset = p.readVarint(true);
  }, b);
  const coord = (v: number, off: number) => (off + b.granularity * v) * 1e-9;
  for (const [start, end] of b.groups) {
    pbf.pos = start;
    pbf.readFields(
      (tag, _, p) => {
        if (tag === 2) {
          if (o.node) dense(p, b, o, coord);
          else p.skip(2);
        } else if (tag === 1) {
          if (o.node) {
            const n = p.readMessage(nodeField(b), { id: 0, lat: 0, lon: 0, keys: [], vals: [] });
            if (!o.taggedNodesOnly || n.keys.length)
              o.node({
                type: "node",
                id: n.id,
                lat: coord(n.lat, b.latOffset),
                lon: coord(n.lon, b.lonOffset),
                tags: tags(b, n.keys, n.vals),
              });
          } else p.skip(2);
        } else if (tag === 3) {
          if (o.way) {
            const w = p.readMessage(wayField, { id: 0, keys: [], vals: [], refs: [] });
            let ref = 0;
            o.way({
              type: "way",
              id: w.id,
              refs: w.refs.map((d: number) => (ref += d)),
              tags: tags(b, w.keys, w.vals),
            });
          } else p.skip(2);
        } else if (tag === 4) {
          if (o.relation) {
            const r = p.readMessage(relationField, {
              id: 0,
              keys: [],
              vals: [],
              roles: [],
              memids: [],
              types: [],
            });
            let ref = 0;
            o.relation({
              type: "relation",
              id: r.id,
              members: r.memids.map((d: number, i: number) => ({
                type: MEMBER_TYPES[r.types[i] ?? 0] ?? "node",
                ref: (ref += d),
                role: b.strings[r.roles[i] ?? 0] ?? "",
              })),
              tags: tags(b, r.keys, r.vals),
            });
          } else p.skip(2);
        } else p.skip(2);
      },
      null,
      end,
    );
  }
}

function tags(b: Block, keys: number[], vals: number[]): Tags {
  const t: Tags = {};
  for (let i = 0; i < keys.length; i++) t[b.strings[keys[i]!]!] = b.strings[vals[i]!]!;
  return t;
}

const nodeField = (_b: Block) => (tag: number, n: any, p: PbfReader) => {
  if (tag === 1) n.id = p.readSVarint();
  else if (tag === 2) p.readPackedVarint(n.keys);
  else if (tag === 3) p.readPackedVarint(n.vals);
  else if (tag === 8) n.lat = p.readSVarint();
  else if (tag === 9) n.lon = p.readSVarint();
};

function wayField(tag: number, w: any, p: PbfReader) {
  if (tag === 1) w.id = p.readVarint();
  else if (tag === 2) p.readPackedVarint(w.keys);
  else if (tag === 3) p.readPackedVarint(w.vals);
  else if (tag === 8) p.readPackedSVarint(w.refs);
}

function relationField(tag: number, r: any, p: PbfReader) {
  if (tag === 1) r.id = p.readVarint();
  else if (tag === 2) p.readPackedVarint(r.keys);
  else if (tag === 3) p.readPackedVarint(r.vals);
  else if (tag === 8) p.readPackedVarint(r.roles, true);
  else if (tag === 9) p.readPackedSVarint(r.memids);
  else if (tag === 10) p.readPackedVarint(r.types);
}

function dense(
  pbf: PbfReader,
  b: Block,
  o: ReadOptions,
  coord: (v: number, off: number) => number,
) {
  const d = pbf.readMessage(
    (tag, x: { ids: number[]; lats: number[]; lons: number[]; kv: number[] }, p) => {
      if (tag === 1) p.readPackedSVarint(x.ids);
      else if (tag === 8) p.readPackedSVarint(x.lats);
      else if (tag === 9) p.readPackedSVarint(x.lons);
      else if (tag === 10) p.readPackedVarint(x.kv, true);
    },
    { ids: [], lats: [], lons: [], kv: [] },
  );
  let id = 0;
  let lat = 0;
  let lon = 0;
  let k = 0;
  for (let i = 0; i < d.ids.length; i++) {
    id += d.ids[i]!;
    lat += d.lats[i]!;
    lon += d.lons[i]!;
    const t: Tags = {};
    let tagged = false;
    // keys_vals: key, val, key, val, …, 0 per node
    while (k < d.kv.length && d.kv[k] !== 0) {
      t[b.strings[d.kv[k]!]!] = b.strings[d.kv[k + 1]!]!;
      k += 2;
      tagged = true;
    }
    k++;
    if (o.taggedNodesOnly && !tagged) continue;
    o.node!({
      type: "node",
      id,
      lat: coord(lat, b.latOffset),
      lon: coord(lon, b.lonOffset),
      tags: t,
    });
  }
}
