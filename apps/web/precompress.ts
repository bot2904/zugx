// Vite plugin: after the build, writes gzip (.gz) and zstd (.zst) siblings of the text assets in
// the output directory, served by Caddy's `file_server { precompressed }` instead of compressing
// on every request. Maximum compression levels (done once per build); files under 1 KB or not
// getting smaller are skipped.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { constants, gzip, zstdCompress } from "node:zlib";
import type { Plugin, ResolvedConfig } from "vite";

const gz = promisify(gzip);
const zst = promisify(zstdCompress);
const COMPRESSIBLE = /\.(?:js|mjs|css|html|svg|json|webmanifest|txt|xml|toml|map|wasm)$/;

async function* files(dir: string): AsyncGenerator<string> {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* files(p);
    else yield p;
  }
}

export function precompress(): Plugin {
  let config: ResolvedConfig;
  return {
    name: "zugx:precompress",
    apply: "build",
    enforce: "post",
    configResolved(c) {
      config = c;
    },
    async closeBundle() {
      const dir = resolve(config.root, config.build.outDir);
      const jobs: Promise<void>[] = [];
      let raw = 0;
      let packed = 0;
      for await (const f of files(dir)) {
        if (!COMPRESSIBLE.test(f)) continue;
        jobs.push(
          (async () => {
            const data = await readFile(f);
            if (data.length < 1024) return;
            const [g, z] = await Promise.all([
              gz(data, { level: 9 }),
              zst(data, { params: { [constants.ZSTD_c_compressionLevel]: 19 } }),
            ]);
            if (g.length < data.length) await writeFile(`${f}.gz`, g);
            if (z.length < data.length) await writeFile(`${f}.zst`, z);
            raw += data.length;
            packed += z.length;
          })(),
        );
      }
      await Promise.all(jobs);
      config.logger.info(
        `precompressed ${jobs.length} files: ${(raw / 1e6).toFixed(1)} MB → ${(packed / 1e6).toFixed(1)} MB zstd (+ gzip)`,
      );
    },
  };
}
