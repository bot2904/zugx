// One-shot converter: prebuilt data JSON → TOML (packages/*/data, except the Netzgrafik-Editor
// exports nge*.json, which stay JSON). Verifies every file round-trips, then removes the JSON.
//   node scripts/json-to-toml.ts [--keep]
import { readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { fromToml, toToml } from "../packages/toml/src/index.ts";

const root = join(import.meta.dirname, "..", "packages");
const files: string[] = [];
const walk = (dir: string) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (f.endsWith(".json") && !/^nge.*\.json$/.test(f)) files.push(p);
  }
};
for (const pkg of readdirSync(root)) {
  try {
    walk(join(root, pkg, "data"));
  } catch {
    /* no data dir */
  }
}
let before = 0;
let after = 0;
for (const f of files.sort()) {
  const raw = JSON.parse(readFileSync(f, "utf8"));
  // TOML needs an object root: a top-level list becomes `<name> = [...]`
  const data = Array.isArray(raw) ? { [basename(f, ".json")]: raw } : raw;
  const text = toToml(data);
  if (!isDeepStrictEqual(fromToml(text), data)) throw new Error(`round-trip mismatch: ${f}`);
  const out = f.replace(/\.json$/, ".toml");
  writeFileSync(out, text);
  const a = statSync(f).size;
  const b = Buffer.byteLength(text);
  before += a;
  after += b;
  console.log(
    `${f.slice(root.length + 1).padEnd(48)} ${(a / 1024).toFixed(0).padStart(6)} KB → ${(b / 1024).toFixed(0).padStart(6)} KB`,
  );
  if (!process.argv.includes("--keep")) unlinkSync(f);
}
console.log(
  `${files.length} files: ${(before / 1024).toFixed(0)} KB → ${(after / 1024).toFixed(0)} KB`,
);
