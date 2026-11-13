// Parse raw mgate responses into normalized types.
// Reference for quirks: hafas-client (public-transport/hafas-client), ÖBB profile.
import type {
  BoardEntry,
  Journey,
  JourneysResult,
  Leg,
  Line,
  Location,
  Movement,
  ProductId,
  Remark,
  StopEvent,
  Stopover,
  Trip,
  TripMatch,
  Warning,
} from "./types.ts";
import { decodePolyline } from "./polyline.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = any;

export interface Common {
  locL: Raw[];
  prodL: Raw[];
  opL: Raw[];
  remL: Raw[];
  himL: Raw[];
  polyL: Raw[];
}

export function common(res: Raw): Common {
  const c = res?.common ?? {};
  return {
    locL: c.locL ?? [],
    prodL: c.prodL ?? [],
    opL: c.opL ?? [],
    remL: c.remL ?? [],
    himL: c.himL ?? [],
    polyL: c.polyL ?? [],
  };
}

// ---------- products ----------

const PRODUCT_BY_CLS: Record<number, ProductId> = {
  1: "highspeed",
  2: "night",
  4: "intercity",
  8: "interregional",
  16: "regional",
  32: "suburban",
  64: "bus",
  128: "ferry",
  256: "subway",
  512: "tram",
  1024: "cable",
  2048: "ondemand",
  4096: "interregional",
};

export const PRODUCT_CLASSES: Record<ProductId, number> = {
  highspeed: 1,
  night: 2,
  intercity: 4,
  interregional: 8 | 4096,
  regional: 16,
  suburban: 32,
  bus: 64,
  ferry: 128,
  subway: 256,
  tram: 512,
  cable: 1024,
  ondemand: 2048,
  other: 0,
};

export const ALL_PRODUCTS = 8191;
export const RAIL_PRODUCTS = 1 | 2 | 4 | 8 | 16 | 32 | 4096;

const NIGHT_CATEGORIES = new Set(["NJ", "EN", "ECN"]);

const BUS_CATEGORIES = new Set(["BUS", "BSV", "SEV", "OBU", "O-BUS", "AST"]);

export function productOf(cls: number | undefined, category = ""): ProductId {
  const cat = category.toUpperCase();
  if (NIGHT_CATEGORIES.has(cat)) return "night";
  if (BUS_CATEGORIES.has(cat)) return "bus";
  return (cls !== undefined && PRODUCT_BY_CLS[cls]) || "other";
}

export function parseLine(p: Raw, c: Common): Line {
  const ctx = p?.prodCtx ?? {};
  const category =
    String(ctx.catOutS ?? ctx.catOut ?? "").trim() || String(p?.name ?? "").split(" ")[0] || "";
  const op = p?.oprX !== undefined ? c.opL[p.oprX] : undefined;
  // local transport has a line ("Tram 18", "Bus 69A"); trains have a train number ("RJX 13474")
  const isLine = ctx.line !== undefined;
  const number = String(isLine ? ctx.line : (ctx.num ?? p?.number ?? "")).trim();
  const name = isLine
    ? String(p?.nameS ?? p?.name ?? `${category} ${number}`).trim()
    : `${category} ${number}`.trim() || String(p?.name ?? "").trim();
  return {
    name,
    category,
    number,
    categoryLong: ctx.catOutL?.trim() || undefined,
    cls: p?.cls ?? 0,
    product: productOf(p?.cls, category),
    operator: op?.name,
  };
}

// ---------- locations ----------

export function parseLocation(l: Raw): Location {
  const type = l?.type === "S" ? "station" : l?.type === "P" ? "poi" : "address";
  const loc: Location = {
    id: l?.extId ?? l?.lid ?? "",
    name: l?.name ?? "",
    type,
    lid: l?.lid,
  };
  if (l?.crd) {
    loc.lat = l.crd.y / 1e6;
    loc.lon = l.crd.x / 1e6;
  }
  if (l?.pCls !== undefined) loc.products = l.pCls;
  if (l?.dist !== undefined) loc.distance = l.dist;
  if (l?.wt !== undefined) loc.weight = l.wt;
  return loc;
}

/** Build a HAFAS location string for a station ID. */
export const stationLid = (id: string) => `A=1@L=${id}@`;

// ---------- time ----------

const pad = (n: number, w = 2) => String(Math.abs(n)).padStart(w, "0");

const viennaFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Vienna",
  timeZoneName: "longOffset",
});

/** Offset of Europe/Vienna in minutes at the given UTC instant. */
export function viennaOffset(utcMs: number): number {
  const part =
    viennaFmt.formatToParts(new Date(utcMs)).find((p) => p.type === "timeZoneName")?.value ?? "";
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(part);
  if (!m) return 60;
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0));
}

/**
 * Parse a HAFAS time ("HHMMSS" or "DDHHMMSS" with day offset) relative to a date "YYYYMMDD".
 * Returns ISO 8601 with UTC offset, e.g. "2026-11-13T12:24:00+01:00".
 */
export function parseTime(
  date: string,
  time: string | undefined,
  tzOffset?: number,
): string | undefined {
  if (!time || !date) return undefined;
  const t = time.padStart(6, "0");
  const dayOff = t.length > 6 ? Number(t.slice(0, -6)) : 0;
  const hms = t.slice(-6);
  const y = Number(date.slice(0, 4));
  const mo = Number(date.slice(4, 6));
  const d = Number(date.slice(6, 8));
  const h = Number(hms.slice(0, 2));
  const mi = Number(hms.slice(2, 4));
  const s = Number(hms.slice(4, 6));
  const localAsUtc = Date.UTC(y, mo - 1, d + dayOff, h, mi, s);
  const off = tzOffset ?? viennaOffset(localAsUtc - 60 * 60_000);
  return formatIso(localAsUtc - off * 60_000, off);
}

/** Format a UTC instant as local ISO time with the given offset (minutes). */
export function formatIso(utcMs: number, offsetMin: number): string {
  const l = new Date(utcMs + offsetMin * 60_000);
  const sign = offsetMin < 0 ? "-" : "+";
  return (
    `${l.getUTCFullYear()}-${pad(l.getUTCMonth() + 1)}-${pad(l.getUTCDate())}` +
    `T${pad(l.getUTCHours())}:${pad(l.getUTCMinutes())}:${pad(l.getUTCSeconds())}` +
    `${sign}${pad(Math.floor(Math.abs(offsetMin) / 60))}:${pad(Math.abs(offsetMin) % 60)}`
  );
}

/** Parse a HAFAS duration "HHMMSS" or "DDHHMMSS" into minutes. */
export function parseDuration(d: string | undefined): number {
  if (!d) return 0;
  const t = d.padStart(6, "0");
  const days = t.length > 6 ? Number(t.slice(0, -6)) : 0;
  const hms = t.slice(-6);
  return days * 1440 + Number(hms.slice(0, 2)) * 60 + Number(hms.slice(2, 4));
}

const minutesBetween = (a: string, b: string) =>
  Math.round((Date.parse(b) - Date.parse(a)) / 60_000);

function event(s: Raw, kind: "a" | "d", date: string): StopEvent | undefined {
  const planned = parseTime(date, s?.[`${kind}TimeS`], s?.[`${kind}TZOffset`]);
  if (!planned) return undefined;
  const ev: StopEvent = { planned };
  const actual = parseTime(date, s?.[`${kind}TimeR`], s?.[`${kind}TZOffset`]);
  if (actual) {
    ev.actual = actual;
    ev.delay = minutesBetween(planned, actual);
  }
  const pS = s?.[`${kind}PltfS`]?.txt ?? s?.[`${kind}PlatfS`];
  const pR = s?.[`${kind}PltfR`]?.txt ?? s?.[`${kind}PlatfR`];
  if (pR ?? pS) ev.platform = pR ?? pS;
  if (pS) ev.plannedPlatform = pS;
  if (s?.[`${kind}Cncl`]) ev.cancelled = true;
  return ev;
}

// ---------- remarks ----------

export function parseRemarks(msgL: Raw[] | undefined, c: Common): Remark[] {
  const out: Remark[] = [];
  const seen = new Set<string>();
  for (const m of msgL ?? []) {
    let r: Remark | undefined;
    if (m.type === "REM" && m.remX !== undefined) {
      const rem = c.remL[m.remX];
      if (!rem?.txtN) continue;
      r = { kind: rem.type === "A" ? "hint" : "status", code: rem.code, text: stripHtml(rem.txtN) };
    } else if (m.type === "HIM" && m.himX !== undefined) {
      const him = c.himL[m.himX];
      if (!him) continue;
      r = {
        kind: "warning",
        code: him.hid,
        summary: stripHtml(him.head ?? ""),
        text: stripHtml(him.text ?? ""),
      };
    }
    if (!r) continue;
    const key = `${r.code}|${r.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

export function stripHtml(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .trim();
}

// ---------- stopovers ----------

function parseStopover(s: Raw, date: string, c: Common): Stopover {
  const so: Stopover = { stop: parseLocation(c.locL[s.locX]) };
  const arr = event(s, "a", date);
  const dep = event(s, "d", date);
  if (arr) so.arr = arr;
  if (dep) so.dep = dep;
  if ((s.aCncl || !arr) && (s.dCncl || !dep) && (s.aCncl || s.dCncl)) so.cancelled = true;
  if (s.isAdd) so.additional = true;
  const rem = parseRemarks(s.msgL, c);
  if (rem.length) so.remarks = rem;
  return so;
}

function polylineOf(polyG: Raw, c: Common): [number, number][] | undefined {
  const pts: [number, number][] = [];
  for (const idx of polyG?.polyXL ?? []) {
    const p = c.polyL[idx];
    if (p?.crdEncYX) pts.push(...decodePolyline(p.crdEncYX));
  }
  return pts.length ? pts : undefined;
}

// ---------- methods ----------

export function parseLocMatch(res: Raw): Location[] {
  return (res?.match?.locL ?? []).map(parseLocation);
}

export function parseLocGeoPos(res: Raw): Location[] {
  return (res?.locL ?? []).map(parseLocation);
}

export function parseStationBoard(res: Raw, type: "DEP" | "ARR"): BoardEntry[] {
  const c = common(res);
  const kind = type === "DEP" ? "d" : "a";
  return (res?.jnyL ?? []).map((j: Raw): BoardEntry => {
    const s = j.stbStop ?? {};
    const when = event(s, kind, j.date) ?? { planned: "" };
    const cancelled = Boolean(j.isCncl || s[`${kind}Cncl`]);
    if (cancelled) when.cancelled = true;
    return {
      journeyId: j.jid,
      line: parseLine(c.prodL[j.prodX], c),
      direction: j.dirTxt ?? "",
      stop: parseLocation(c.locL[s.locX]),
      when,
      cancelled,
      remarks: parseRemarks(j.msgL, c),
    };
  });
}

function parseLeg(sec: Raw, date: string, c: Common): Leg {
  const dep = event(sec.dep, "d", date) ?? { planned: "" };
  const arr = event(sec.arr, "a", date) ?? { planned: "" };
  const origin = parseLocation(c.locL[sec.dep?.locX]);
  const destination = parseLocation(c.locL[sec.arr?.locX]);
  if (sec.type === "JNY") {
    const j = sec.jny ?? {};
    const leg: Leg = {
      kind: "journey",
      origin,
      destination,
      dep,
      arr,
      line: parseLine(c.prodL[j.prodX], c),
      direction: j.dirTxt ?? "",
      journeyId: j.jid,
      stopovers: (j.stopL ?? []).map((s: Raw) => parseStopover(s, date, c)),
      remarks: parseRemarks(j.msgL, c),
    };
    const poly = polylineOf(j.polyG, c);
    if (poly) leg.polyline = poly;
    if (j.isCncl || sec.dep?.dCncl || sec.arr?.aCncl) leg.cancelled = true;
    return leg;
  }
  return {
    kind: sec.type === "WALK" || sec.type === "TRSF" ? "walk" : "transfer",
    origin,
    destination,
    dep,
    arr,
    remarks: [],
    duration:
      parseDuration(sec.chg?.durS ?? sec.gis?.durS) || minutesBetween(dep.planned, arr.planned),
  };
}

export function parseJourney(con: Raw, c: Common): Journey {
  const legs = (con.secL ?? []).map((s: Raw) => parseLeg(s, con.date, c));
  const dep = event(con.dep, "d", con.date) ?? legs[0]?.dep ?? { planned: "" };
  const arr = event(con.arr, "a", con.date) ?? legs.at(-1)?.arr ?? { planned: "" };
  return {
    recon: con.recon?.ctx ?? con.ctxRecon,
    legs,
    dep,
    arr,
    duration: parseDuration(con.dur),
    transfers: con.chg ?? Math.max(0, legs.filter((l: Leg) => l.kind === "journey").length - 1),
  };
}

export function parseTripSearch(res: Raw): JourneysResult {
  const c = common(res);
  return {
    journeys: (res?.outConL ?? []).map((con: Raw) => parseJourney(con, c)),
    earlierRef: res?.outCtxScrB,
    laterRef: res?.outCtxScrF,
  };
}

export function parseReconstruction(res: Raw): Journey | undefined {
  const c = common(res);
  const con = res?.outConL?.[0];
  return con ? parseJourney(con, c) : undefined;
}

export function parseJourneyDetails(res: Raw): Trip {
  const c = common(res);
  const j = res?.journey ?? {};
  const trip: Trip = {
    journeyId: j.jid,
    date: j.date,
    line: parseLine(c.prodL[j.prodX], c),
    direction: j.dirTxt ?? "",
    stopovers: (j.stopL ?? []).map((s: Raw) => parseStopover(s, j.date, c)),
    remarks: parseRemarks(j.msgL, c),
  };
  const poly = polylineOf(j.polyG, c);
  if (poly) trip.polyline = poly;
  const days = j.sDaysL?.[0];
  if (days?.sDaysR) trip.runningDays = [days.sDaysR, days.sDaysI].filter(Boolean).join(": ");
  return trip;
}

export function parseJourneyMatch(res: Raw): TripMatch[] {
  const c = common(res);
  return (res?.jnyL ?? []).map((j: Raw): TripMatch => {
    const first = j.stopL?.[0];
    const last = j.stopL?.at(-1);
    const m: TripMatch = {
      journeyId: j.jid,
      date: j.date,
      line: parseLine(c.prodL[j.prodX], c),
      direction: j.dirTxt ?? (last ? (c.locL[last.locX]?.name ?? "") : ""),
    };
    if (first) {
      m.origin = parseLocation(c.locL[first.locX]);
      const dep = event(first, "d", j.date);
      if (dep) m.dep = dep;
    }
    if (last) {
      m.destination = parseLocation(c.locL[last.locX]);
      const arr = event(last, "a", j.date);
      if (arr) m.arr = arr;
    }
    return m;
  });
}

export function parseJourneyGeoPos(res: Raw): Movement[] {
  const c = common(res);
  return (res?.jnyL ?? [])
    .filter((j: Raw) => j.pos)
    .map((j: Raw): Movement => ({
      journeyId: j.jid,
      line: parseLine(c.prodL[j.prodX], c),
      direction: j.dirTxt ?? "",
      lat: j.pos.y / 1e6,
      lon: j.pos.x / 1e6,
      nextStops: (j.stopL ?? []).slice(0, 3).map((s: Raw) => parseStopover(s, j.date, c)),
    }));
}

export function parseHimSearch(res: Raw): Warning[] {
  const c = common(res);
  return (res?.msgL ?? []).map((m: Raw): Warning => {
    const w: Warning = {
      id: m.hid,
      title: stripHtml(m.head ?? ""),
      text: stripHtml(m.text ?? ""),
      priority: m.prio ?? 0,
      products: m.prod ?? 0,
    };
    const from = parseTime(m.sDate, m.sTime);
    const until = parseTime(m.eDate, m.eTime);
    const mod = parseTime(m.lModDate, m.lModTime);
    if (from) w.validFrom = from;
    if (until) w.validUntil = until;
    if (mod) w.modified = mod;
    if (m.fLocX !== undefined && c.locL[m.fLocX]) w.affectedFrom = parseLocation(c.locL[m.fLocX]);
    if (m.tLocX !== undefined && c.locL[m.tLocX]) w.affectedTo = parseLocation(c.locL[m.tLocX]);
    if (m.comp) w.category = m.comp;
    return w;
  });
}
