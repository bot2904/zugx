import { describe, expect, it } from "vite-plus/test";
import { encodeNetzgrafik, ngeLink, NGE_APP } from "./nge.ts";

const decode = async (data: string) => {
  const bytes = Uint8Array.from(atob(data.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
    c.charCodeAt(0),
  );
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(stream).text();
};

describe("Netzgrafik-Editor link", () => {
  it("round-trips the JSON through deflate-raw + base64url", async () => {
    const json = JSON.stringify({ nodes: [{ fullName: "Wien Hbf" }], x: "Ö".repeat(50_000) });
    const data = await encodeNetzgrafik(json);
    expect(data).toMatch(/^[\w-]+$/);
    expect(await decode(data)).toBe(json);
  });
  it("puts the data into the fragment of the editor URL", async () => {
    expect(await ngeLink("{}")).toMatch(new RegExp(`^${NGE_APP}#netzgrafik=[\\w-]+$`));
  });
});
