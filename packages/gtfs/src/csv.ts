// Small streaming CSV parser (RFC 4180: quoted fields, "" escapes, CRLF/LF, BOM).
// Feed it text chunks; it calls `onRow` with each record as a string array.

export class CsvParser {
  private row: string[] = [];
  private field = "";
  private quoted = false;
  /** inside quotes */
  private inQuotes = false;
  /** last char was a quote inside a quoted field (maybe the closing one) */
  private quotePending = false;
  private first = true;

  constructor(private readonly onRow: (row: string[]) => void) {}

  push(chunk: string): void {
    let s = chunk;
    if (this.first) {
      this.first = false;
      if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
    }
    let start = 0;
    const n = s.length;
    for (let i = 0; i < n; i++) {
      const c = s.charCodeAt(i);
      if (this.inQuotes) {
        if (this.quotePending) {
          this.quotePending = false;
          if (c === 34) {
            // escaped quote: keep one
            this.field += '"';
            start = i + 1;
            continue;
          }
          // closing quote was the previous char
          this.inQuotes = false;
          // fall through to unquoted handling of c
        } else {
          if (c === 34) {
            this.field += s.slice(start, i);
            this.quotePending = true;
            start = i + 1;
          }
          continue;
        }
      }
      if (c === 44 /* , */) {
        this.field += s.slice(start, i);
        this.endField();
        start = i + 1;
      } else if (c === 10 /* \n */) {
        this.field += s.slice(start, i);
        this.endRow();
        start = i + 1;
      } else if (c === 13 /* \r */) {
        this.field += s.slice(start, i);
        start = i + 1;
      } else if (c === 34 && this.field === "" && start === i && !this.quoted) {
        this.inQuotes = true;
        this.quoted = true;
        start = i + 1;
      }
    }
    this.field += s.slice(start);
  }

  end(): void {
    if (this.inQuotes && this.quotePending) this.inQuotes = false;
    if (this.field !== "" || this.row.length > 0) this.endRow();
  }

  private endField() {
    this.row.push(this.field);
    this.field = "";
    this.quoted = false;
  }

  private endRow() {
    this.endField();
    const row = this.row;
    this.row = [];
    if (row.length === 1 && row[0] === "") return; // blank line
    this.onRow(row);
  }
}

/** Parse a whole CSV string into objects keyed by the header row. */
export function parseCsv(text: string): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  let header: string[] | undefined;
  const p = new CsvParser((row) => {
    if (!header) {
      header = row.map((h) => h.trim());
      return;
    }
    const o: Record<string, string> = {};
    for (let i = 0; i < header.length; i++) o[header[i]!] = row[i] ?? "";
    out.push(o);
  });
  p.push(text);
  p.end();
  return out;
}
