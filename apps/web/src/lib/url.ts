// URL-safe encoding for long HAFAS tokens (recon contexts) in paths.
export function b64url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function unb64url(s: string): string {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** friendly train slug: "RJX 260" → "RJX-260" */
export const trainSlug = (name: string) => name.trim().replace(/\s+/g, "-");
export const slugToTrain = (slug: string) => slug.replace(/-/g, " ");
export const isJourneyId = (s: string) => s.includes("|");
