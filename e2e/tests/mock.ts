// Answer /api/mgate from the recorded fixtures (packages/hafas/fixtures), keyed by method.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";

const dir = join(import.meta.dirname, "..", "..", "packages", "hafas", "fixtures");
const fixture = (name: string) =>
  JSON.parse(readFileSync(join(dir, `${name}.json`), "utf8")).response;

const BY_METH: Record<string, string> = {
  LocMatch: "loc-match",
  LocGeoPos: "loc-geo-pos",
  TripSearch: "trip-search",
  Reconstruction: "reconstruction",
  JourneyDetails: "journey-details",
  JourneyMatch: "journey-match",
  JourneyGeoPos: "journey-geo-pos",
  HimSearch: "him-search",
};

export async function mockApi(page: Page) {
  await page.route("**/api/mgate", async (route) => {
    const body = route.request().postDataJSON();
    const req = body.svcReqL[0];
    const name =
      req.meth === "StationBoard"
        ? req.req.type === "ARR"
          ? "station-board-arr"
          : "station-board"
        : BY_METH[req.meth];
    await route.fulfill({ json: fixture(name!) });
  });
  // keep map tiles offline
  await page.route(/tile\.openstreetmap\.org|openrailwaymap\.org/, (r) =>
    r.fulfill({ status: 204 }),
  );
}
