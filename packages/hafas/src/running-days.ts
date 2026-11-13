// HAFAS running-day bitmaps ("sDaysB"): hex string, one bit per day starting at the timetable begin (fpB).
/** Decode to a list of ISO dates (YYYY-MM-DD). */
export function runningDays(hex: string, timetableBegin: string): string[] {
  const y = Number(timetableBegin.slice(0, 4));
  const m = Number(timetableBegin.slice(4, 6));
  const d = Number(timetableBegin.slice(6, 8));
  const out: string[] = [];
  for (let i = 0; i < hex.length; i++) {
    const nibble = parseInt(hex[i] ?? "0", 16);
    for (let b = 0; b < 4; b++) {
      if (nibble & (8 >> b)) {
        const day = new Date(Date.UTC(y, m - 1, d + i * 4 + b));
        out.push(day.toISOString().slice(0, 10));
      }
    }
  }
  return out;
}
