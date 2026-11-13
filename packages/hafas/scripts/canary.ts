// Daily canary: verify the unofficial ÖBB mgate API still answers all methods we use.
// Exits non-zero if any call fails (AID/version changes, blocking, schema drift).
import "temporal-polyfill/global"; // Node < 26: no native Temporal
import { createClient, OEBB_ENDPOINT } from "../src/index.ts";

const c = createClient({
  endpoint: OEBB_ENDPOINT,
  ttl: 0,
  headers: { "User-Agent": "zugx-canary (https://zugx.legner.me)" },
});
const checks: [string, () => Promise<unknown>][] = [
  ["locations", async () => (await c.locations("Wien Hbf", 3)).length > 0],
  ["nearby", async () => (await c.nearby(48.185, 16.376, 1000, 3)).length > 0],
  ["board", async () => (await c.board("8103000", { results: 10 })).length > 0],
  [
    "journeys",
    async () => (await c.journeys("8103000", "8100002", { results: 2 })).journeys.length > 0,
  ],
  ["tripsByName", async () => (await c.tripsByName("RJX 162")).length >= 0],
  [
    "trip",
    async () => {
      const b = await c.board("8103000", { results: 1 });
      return b[0] ? (await c.trip(b[0].journeyId)).stopovers.length > 1 : false;
    },
  ],
  [
    "radar",
    async () => (await c.radar({ north: 48.3, south: 48.1, west: 16.2, east: 16.5 })).length >= 0,
  ],
  ["warnings", async () => (await c.warnings(5)).length >= 0],
];

let failed = 0;
for (const [name, fn] of checks) {
  const t = Date.now();
  try {
    const ok = await fn();
    if (!ok) throw new Error("empty result");
    console.log(`ok   ${name} ${Date.now() - t}ms`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}: ${e instanceof Error ? e.message : String(e)}`);
  }
}
process.exit(failed ? 1 : 0);
