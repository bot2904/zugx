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

export { VIENNA } from "@zugx/hafas";
import { VIENNA } from "@zugx/hafas";

/** Now, as a wall-clock time in Europe/Vienna. */
export const viennaNow = () => Temporal.Now.zonedDateTimeISO(VIENNA);

type When = Temporal.Instant | Temporal.ZonedDateTime;
const inVienna = (t: When = Temporal.Now.instant()) =>
  t instanceof Temporal.Instant ? t.toZonedDateTimeISO(VIENNA) : t.withTimeZone(VIENNA);

/** Local datetime-input value (YYYY-MM-DDTHH:MM) in Europe/Vienna. */
export const toLocalInput = (t?: When) =>
  inVienna(t).toPlainDateTime().toString({ smallestUnit: "minute" });

/** The date (YYYY-MM-DD) in Europe/Vienna — not the browser's time zone, not UTC. Default: today. */
export const viennaDate = (t?: When) => inVienna(t).toPlainDate().toString();

/** Minutes since midnight in Europe/Vienna wall-clock time. Default: now. */
export const viennaMinutes = (t?: When) => {
  const z = inVienna(t);
  return z.hour * 60 + z.minute;
};

/** Parse a "YYYY-MM-DD[THH:MM]" Vienna wall-clock value (URL parameter, input). */
export function fromLocalInput(v: string): Temporal.ZonedDateTime | undefined {
  if (!/^\d{4}-\d\d-\d\d(T\d\d:\d\d)?$/.test(v)) return undefined;
  try {
    return Temporal.PlainDateTime.from(v).toZonedDateTime(VIENNA);
  } catch {
    return undefined; // e.g. 2026-02-30
  }
}

/** An ISO time from HAFAS (with offset) as an instant. */
export const instant = (iso: string) => Temporal.Instant.from(iso);

/** Shift an ISO date (YYYY-MM-DD) by whole days. */
export const addDays = (iso: string, days: number) =>
  Temporal.PlainDate.from(iso).add({ days }).toString();

/** Whole days from ISO date a to b. */
export const daysBetween = (a: string, b: string) =>
  Temporal.PlainDate.from(a).until(Temporal.PlainDate.from(b)).days;

export const minutesOfDay = (iso: string) => +iso.slice(11, 13) * 60 + +iso.slice(14, 16);
/** Epoch milliseconds (for chart scales), NaN if missing. */
export const ms = (iso?: string) => (iso ? instant(iso).epochMilliseconds : NaN);
