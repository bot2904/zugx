// Vite plugin: `import data from "./x.toml"` works like a JSON import (parsed at build time,
// "" → null as in fromToml; emitted as JSON.parse of a string literal, fast for big files).
import { readFileSync } from "node:fs";
import { fromToml } from "./index.ts";

/** minimal structural type of a Vite plugin (avoids depending on a particular Vite build) */
interface TomlPlugin {
  name: string;
  load(
    this: { addWatchFile(file: string): void },
    id: string,
  ): { code: string; map: { mappings: string } } | null;
}

export function toml(): TomlPlugin {
  return {
    name: "zugx:toml",
    load(id) {
      const [path, query] = id.split("?");
      if (!path!.endsWith(".toml") || query) return null;
      this.addWatchFile(path!);
      const data = fromToml(readFileSync(path!, "utf8"));
      return {
        code: `export default JSON.parse(${JSON.stringify(JSON.stringify(data))});\n`,
        map: { mappings: "" },
      };
    },
  };
}
