// Links into the public Netzgrafik-Editor (OpenRail Association) with the data in the URL fragment:
// #netzgrafik=<deflate-raw compressed, base64url encoded NGE JSON>. The fragment never reaches a
// server, so no CORS/CSP changes are needed on either side (~21 KB for the zugx network).
// Proposed upstream (NGE branch feat/import-from-url); until it is merged and deployed, the editor
// ignores the fragment and simply opens.

export const NGE_APP = "https://openrailassociation.github.io/netzgrafik-editor-frontend/";

const toBase64Url = (bytes: Uint8Array) => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/** `<data>` for `#netzgrafik=<data>` */
export async function encodeNetzgrafik(json: string): Promise<string> {
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return toBase64Url(new Uint8Array(await new Response(stream).arrayBuffer()));
}

/** Netzgrafik-Editor link that opens the given NGE JSON. */
export const ngeLink = async (json: string) =>
  `${NGE_APP}#netzgrafik=${await encodeNetzgrafik(json)}`;
