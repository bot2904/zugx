// Display helpers. HAFAS times are ISO strings with the local Vienna offset, so HH:MM is a slice.
import type { StopEvent } from "@zugx/hafas";

export const hhmm = (iso?: string) => (iso ? iso.slice(11, 16) : "");
export const isoDate = (iso: string) => iso.slice(0, 10);

export function fmtDuration(min: number): string {
  if (!Number.isFinite(min)) return "";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h}:${String(m).padStart(2, "0")}` : `${m}′`;
}

export function delayClass(ev?: StopEvent): string {
  if (!ev) return "";
  if (ev.cancelled) return "text-[var(--bad)] line-through";
  if (ev.delay === undefined) return "";
  if (ev.delay >= 5) return "text-[var(--bad)]";
  if (ev.delay >= 1) return "text-[var(--warn)]";
  return "text-[var(--good)]";
}

export function fmtDelay(ev?: StopEvent): string {
  if (!ev || ev.delay === undefined) return "";
  return ev.delay > 0 ? `+${ev.delay}` : ev.delay < 0 ? String(ev.delay) : "±0";
}

/** Local datetime-input value (YYYY-MM-DDTHH:MM) in Europe/Vienna for a Date. */
export function toLocalInput(d: Date): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Vienna",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** Today's date (YYYY-MM-DD) in Europe/Vienna — not the browser's time zone, not UTC. */
export const viennaDate = (d = new Date()) => toLocalInput(d).slice(0, 10);

/** Minutes since midnight in Europe/Vienna wall-clock time. */
export const viennaMinutes = (d = new Date()) => minutesOfDay(toLocalInput(d));

/** Parse a "YYYY-MM-DDTHH:MM" Vienna local value into a Date. */
export function fromLocalInput(v: string): Date | undefined {
  const m = /^(\d{4})-(\d\d)-(\d\d)(?:T(\d\d):(\d\d))?$/.exec(v);
  if (!m) return undefined;
  const utc = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +(m[4] ?? 0), +(m[5] ?? 0));
  // offset at that instant (try CET, then correct)
  let off = 60;
  for (let i = 0; i < 2; i++) {
    const d = new Date(utc - off * 60_000);
    const s = new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Vienna",
      timeZoneName: "longOffset",
    })
      .formatToParts(d)
      .find((p) => p.type === "timeZoneName")?.value;
    const mm = /GMT([+-])(\d\d):(\d\d)/.exec(s ?? "");
    off = mm ? (mm[1] === "-" ? -1 : 1) * (+mm[2]! * 60 + +mm[3]!) : 60;
  }
  return new Date(utc - off * 60_000);
}

export const minutesOfDay = (iso: string) => +iso.slice(11, 13) * 60 + +iso.slice(14, 16);
export const ms = (iso?: string) => (iso ? Date.parse(iso) : NaN);
