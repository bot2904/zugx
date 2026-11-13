// Stream selected entries out of a (large) zip file without loading it into memory.
import { createReadStream } from "node:fs";
import { Unzip, UnzipInflate } from "fflate";

export interface EntrySink {
  data(chunk: Uint8Array): void;
  end(): void;
}

/**
 * Stream the zip at `path`; for every entry whose name `pick` returns a sink for,
 * its uncompressed bytes are passed to that sink. Other entries are skipped (not inflated).
 */
export async function streamZip(
  path: string,
  pick: (name: string) => EntrySink | undefined,
): Promise<void> {
  let failure: unknown;
  const uz = new Unzip((file) => {
    const sink = pick(file.name);
    if (!sink) return;
    file.ondata = (err, chunk, final) => {
      if (err) {
        failure = err;
        return;
      }
      if (chunk.length) sink.data(chunk);
      if (final) sink.end();
    };
    file.start();
  });
  uz.register(UnzipInflate);
  const stream = createReadStream(path, { highWaterMark: 1 << 20 });
  for await (const chunk of stream) {
    uz.push(chunk as Uint8Array, false);
    if (failure) throw failure;
  }
  uz.push(new Uint8Array(0), true);
  if (failure) throw failure;
}
