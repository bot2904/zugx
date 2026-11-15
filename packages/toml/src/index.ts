/**
 * Prebuilt data files as TOML (see PLAN.md: "Prebuilt data as TOML").
 *
 * TOML has no null, so `null` is stored as `""` and read back as null: {@link toToml} throws on a
 * real empty string, {@link fromToml} maps every `""` to null (our data has no empty strings).
 *
 * Layout (keeps one record per line, like the JSON files had, so data diffs stay reviewable):
 * - records without nested tables (and short ones with only flat nested tables) are written
 *   inline, `{ id = "…", … }`, one per line inside a multi-line array or as `key = { … }`;
 * - everything else becomes `[table]` / `[[array.of.tables]]` sections.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parse } from "smol-toml";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

const key = (k: string) => (/^[A-Za-z0-9_-]+$/.test(k) ? k : JSON.stringify(k));

/** inline TOML value; null → "" */
function inline(v: unknown, path: string): string {
  if (v === null || v === undefined) return '""';
  if (typeof v === "string") {
    if (v === "") throw new Error(`${path}: empty string can't be stored (it means null in TOML)`);
    // JSON string escapes (\" \\ \n \t \uXXXX) are valid TOML basic-string escapes
    return JSON.stringify(v);
  }
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error(`${path}: non-finite number ${v}`);
    return String(v);
  }
  if (typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return `[${v.map((x, i) => inline(x, `${path}[${i}]`)).join(", ")}]`;
  if (isObj(v)) {
    const entries = Object.entries(v).filter(([, x]) => x !== undefined);
    if (!entries.length) return "{}";
    return `{ ${entries.map(([k, x]) => `${key(k)} = ${inline(x, `${path}.${k}`)}`).join(", ")} }`;
  }
  throw new Error(`${path}: unsupported value ${typeof v}`);
}

const hasObject = (v: unknown): boolean => isObj(v) || (Array.isArray(v) && v.some(hasObject));

/** written on one line: no nested tables at all, or only flat ones and short */
function isRecord(o: Obj, path: string): boolean {
  const values = Object.values(o);
  if (!values.some(hasObject)) return true;
  const flatNested = values.every(
    (x) => !hasObject(x) || (isObj(x) && !Object.values(x).some(hasObject)),
  );
  return flatNested && inline(o, path).length <= 300;
}

function table(o: Obj, path: string[], out: string[]) {
  const p = path.map(key).join(".");
  const sub: [string, Obj][] = [];
  const subArrays: [string, Obj[]][] = [];
  const lines: string[] = [];
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined) continue;
    const here = [...path, k].join(".");
    if (isObj(v) && !isRecord(v, here)) sub.push([k, v]);
    else if (Array.isArray(v) && v.length && v.every(isObj)) {
      if (v.every((x, i) => isRecord(x, `${here}[${i}]`)))
        lines.push(
          `${key(k)} = [\n${v.map((x, i) => `  ${inline(x, `${here}[${i}]`)},`).join("\n")}\n]`,
        );
      else subArrays.push([k, v]);
    } else if (isObj(v) && Object.keys(v).length > 20 && !Object.values(v).some(hasObject)) {
      // big flat maps (e.g. station id → name): a section with one entry per line
      sub.push([k, v]);
    } else lines.push(`${key(k)} = ${inline(v, here)}`);
  }
  if (path.length && (lines.length || (!sub.length && !subArrays.length)))
    out.push(`${out.length ? "\n" : ""}[${p}]`);
  out.push(...lines);
  for (const [k, v] of sub) {
    if (Object.keys(v).length > 20 && !Object.values(v).some(hasObject)) {
      out.push(`${out.length ? "\n" : ""}[${[...path, k].map(key).join(".")}]`);
      for (const [kk, x] of Object.entries(v))
        if (x !== undefined) out.push(`${key(kk)} = ${inline(x, `${p}.${k}.${kk}`)}`);
    } else table(v, [...path, k], out);
  }
  for (const [k, arr] of subArrays) {
    for (const x of arr) {
      const inner: string[] = [];
      table(x, [...path, k], inner);
      // the first line of `inner` is the [path] header of x; turn it into [[path]]
      const header = `[${[...path, k].map(key).join(".")}]`;
      const i = inner.findIndex((l) => l.trim() === header);
      if (i >= 0) inner[i] = inner[i]!.replace(header, `[${header}]`);
      else inner.unshift(`[${header}]`);
      out.push(`${out.length ? "\n" : ""}${inner.join("\n").replace(/^\n/, "")}`);
    }
  }
}

/** TOML text for a data object (root must be an object); null → "", throws on real "". */
export function toToml(data: unknown): string {
  if (!isObj(data)) throw new Error("TOML data root must be an object");
  const out: string[] = [];
  table(data, [], out);
  return `${out.join("\n")}\n`;
}

/** parsed TOML with every "" turned back into null */
export function fromToml<T = unknown>(text: string): T {
  return denull(parse(text)) as T;
}

/** "" → null; plain objects (the parser returns null-prototype ones) */
function denull(v: unknown): unknown {
  if (v === "") return null;
  if (Array.isArray(v)) return v.map(denull);
  if (isObj(v)) {
    const o: Obj = {};
    for (const k of Object.keys(v)) o[k] = denull(v[k]);
    return o;
  }
  return v;
}

/** copy of a map with sorted keys (stable, reviewable diffs) */
export const sortKeys = <T>(m: Record<string, T>): Record<string, T> =>
  Object.fromEntries(
    Object.keys(m)
      .sort()
      .map((k) => [k, m[k]!]),
  );

export function readToml<T>(path: string, fallback: T): T {
  return existsSync(path) ? fromToml<T>(readFileSync(path, "utf8")) : fallback;
}

/** writes TOML and returns the text */
export function writeToml(path: string, data: unknown): string {
  const text = toToml(data);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  return text;
}
