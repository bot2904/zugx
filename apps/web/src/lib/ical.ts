// iCalendar (RFC 5545) export for a journey.
import type { Journey, Leg, StopEvent } from "@zugx/hafas";
import { fmtDuration, hhmm } from "./format.ts";

export interface IcsLabels {
  platform: string;
  transfer: (min: number) => string;
  walk: (min: number) => string;
  duration: string;
  transfers: string;
  realtime: string;
  open: string;
}

/** UTC timestamp in iCalendar form: 20261113T122400Z */
const icsDate = (t: string | Temporal.Instant) =>
  Temporal.Instant.from(t).toString({ smallestUnit: "second" }).replace(/[-:]/g, "");

/** Escape TEXT values (RFC 5545 §3.3.11). */
export const icsEscape = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Fold content lines to max. 75 octets (RFC 5545 §3.1), without splitting UTF-8 sequences. */
export function icsFold(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

/** "Wien Hbf (Bahnsteige 3-12)" → "Wien Hbf" */
export const shortName = (name: string) => name.replace(/\s*\(Bahnsteige? [^)]*\)$/, "");

const plat = (ev: StopEvent, l: IcsLabels) =>
  ev.platform ? ` (${l.platform} ${ev.platform})` : "";
const vehicleLegs = (j: Journey) => j.legs.filter((x) => x.kind === "journey");

/** "Wien Hbf → Innsbruck Hbf · RJX 166" (all trains, joined with "/") */
export function icsSummary(j: Journey): string {
  const first = shortName(j.legs[0]?.origin.name ?? "");
  const last = shortName(j.legs.at(-1)?.destination.name ?? "");
  const lines = vehicleLegs(j).map((x) => x.line?.name ?? "");
  return `${first} → ${last} · ${lines.join(" / ")}`;
}

function legText(leg: Leg, l: IcsLabels): string {
  const rt = (ev: StopEvent) => (ev.delay ? ` [${l.realtime} ${hhmm(ev.actual)}]` : "");
  return [
    `${leg.line?.name ?? ""} → ${leg.direction ?? ""}`,
    `  ${hhmm(leg.dep.planned)} ${shortName(leg.origin.name)}${plat(leg.dep, l)}${rt(leg.dep)}`,
    `  ${hhmm(leg.arr.planned)} ${shortName(leg.destination.name)}${plat(leg.arr, l)}${rt(leg.arr)}`,
  ].join("\n");
}

export function icsDescription(j: Journey, url: string, l: IcsLabels): string {
  const parts: string[] = [];
  let prevArr: StopEvent | undefined;
  for (const leg of j.legs) {
    if (leg.kind !== "journey") {
      if (leg.duration) parts.push(`🚶 ${l.walk(leg.duration)}`);
      continue;
    }
    if (prevArr) {
      const min = Math.round(
        Temporal.Instant.from(prevArr.planned).until(leg.dep.planned).total("minutes"),
      );
      parts.push(`⇄ ${l.transfer(min)}`);
    }
    parts.push(legText(leg, l));
    prevArr = leg.arr;
  }
  parts.push(`${l.duration} ${fmtDuration(j.duration)} · ${l.transfers} ${j.transfers}`);
  parts.push(`${l.open}: ${url}`);
  return parts.join("\n\n");
}

export function buildIcs(
  j: Journey,
  url: string,
  l: IcsLabels,
  now = Temporal.Now.instant(),
): string {
  const first = vehicleLegs(j)[0] ?? j.legs[0];
  const uidSrc = j.legs.map((x) => `${x.journeyId ?? x.origin.id}@${x.dep.planned}`).join("|");
  let h = 0;
  for (const c of uidSrc) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//zugx//zugx.legner.me//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${(h >>> 0).toString(36)}-${icsDate(j.dep.planned)}@zugx.legner.me`,
    `DTSTAMP:${icsDate(now)}`,
    `DTSTART:${icsDate(j.dep.planned)}`,
    `DTEND:${icsDate(j.arr.planned)}`,
    `SUMMARY:${icsEscape(icsSummary(j))}`,
    `DESCRIPTION:${icsEscape(icsDescription(j, url, l))}`,
    first ? `LOCATION:${icsEscape(shortName(first.origin.name) + plat(first.dep, l))}` : "",
    first?.origin.lat !== undefined ? `GEO:${first.origin.lat};${first.origin.lon}` : "",
    `URL:${url}`,
    "TRANSP:OPAQUE",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsEscape(icsSummary(j))}`,
    "TRIGGER:-PT15M",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  return lines.map(icsFold).join("\r\n") + "\r\n";
}

/**
 * Hand the event to the user's calendar: Web Share with a file where supported (mobile:
 * opens the share sheet → calendar app), otherwise download the .ics (desktop calendars open it).
 */
export async function addToCalendar(ics: string, filename: string): Promise<void> {
  const file = new File([ics], filename, { type: "text/calendar" });
  if (navigator.canShare?.({ files: [file] }) && matchMedia("(pointer: coarse)").matches) {
    try {
      await navigator.share({ files: [file], title: filename.replace(/\.ics$/, "") });
      return;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
