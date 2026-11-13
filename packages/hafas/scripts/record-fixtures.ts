// M0 spike: call the ÖBB mgate API directly and record raw responses as test fixtures.
// Run: vp run hafas:record
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ENDPOINT = "https://fahrplan.oebb.at/bin/mgate.exe";
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

const envelope = (svcReqL: unknown[]) => ({
  id: "1",
  ver: "1.67",
  lang: "deu",
  auth: { type: "AID", aid: "OWDL4fE4ixNiPBBm" },
  client: { id: "OEBB", type: "WEB", name: "webapp", l: "vs_webapp" },
  formatted: false,
  svcReqL,
});

async function call(meth: string, req: unknown): Promise<any> {
  const body = envelope([{ meth, req }]);
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "zugx (https://zugx.legner.me)" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  const svc = json.svcResL?.[0];
  console.log(meth.padEnd(16), res.status, json.err, svc?.err, svc?.errTxt ?? "");
  return { request: body, response: json };
}

const pad = (n: number) => String(n).padStart(2, "0");
const now = new Date();
const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
const time = `${pad(now.getHours())}${pad(now.getMinutes())}00`;
const wien = { type: "S", lid: "A=1@L=8103000@" };
const salzburg = { type: "S", lid: "A=1@L=8100002@" };

await mkdir(out, { recursive: true });
const save = (name: string, data: unknown) =>
  writeFile(join(out, `${name}.json`), JSON.stringify(data, null, 1) + "\n");

const fx: Record<string, any> = {};
fx["loc-match"] = await call("LocMatch", {
  input: { field: "S", loc: { name: "Linz", type: "ALL" }, maxLoc: 7 },
});
fx["loc-geo-pos"] = await call("LocGeoPos", {
  ring: { cCrd: { x: 16376413, y: 48185184 }, maxDist: 1500 },
  getPOIs: false,
  getStops: true,
  maxLoc: 8,
});
fx["station-board"] = await call("StationBoard", {
  type: "DEP",
  date,
  time,
  stbLoc: wien,
  dur: 60,
  maxJny: 25,
});
fx["station-board-arr"] = await call("StationBoard", {
  type: "ARR",
  date,
  time,
  stbLoc: salzburg,
  dur: 60,
  maxJny: 15,
});
fx["trip-search"] = await call("TripSearch", {
  depLocL: [wien],
  arrLocL: [{ type: "S", lid: "A=1@L=8100173@" }], // Graz Hbf
  outDate: date,
  outTime: time,
  outFrwd: true,
  getPasslist: true,
  getPolyline: true,
  numF: 5,
  maxChg: -1,
  minChgTime: -1,
  ushrp: true,
  getTariff: false,
  jnyFltrL: [{ type: "PROD", mode: "INC", value: "4095" }],
});
for (const [k, v] of Object.entries(fx)) await save(k, v);
const con = fx["trip-search"].response.svcResL[0].res?.outConL?.[0];
if (con?.recon?.ctx) {
  fx["reconstruction"] = await call("Reconstruction", {
    outReconL: [{ ctx: con.recon.ctx }],
    getIST: true,
    getPasslist: true,
    getPolyline: false,
  });
}
const jny = fx["station-board"].response.svcResL[0].res?.jnyL?.[0];
if (jny?.jid) {
  fx["journey-details"] = await call("JourneyDetails", {
    jid: jny.jid,
    getPolyline: true,
    getPasslist: true,
  });
}
fx["journey-match"] = await call("JourneyMatch", { input: "RJX 162", date, onlyCR: false });
fx["journey-geo-pos"] = await call("JourneyGeoPos", {
  maxJny: 60,
  onlyRT: false,
  date,
  time,
  rect: { llCrd: { x: 16200000, y: 48100000 }, urCrd: { x: 16500000, y: 48300000 } },
  perSize: 30000,
  perStep: 5000,
  trainPosMode: "CALC",
});
fx["him-search"] = await call("HimSearch", { himFltrL: [], getPolyline: false, maxNum: 20 });

console.log("saved", Object.keys(fx).length, "fixtures to", out);
for (const [k, v] of Object.entries(fx)) await save(k, v);
