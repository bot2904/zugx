/**
 * Minimal streaming CSV parser (RFC 4180: quoted fields, "" escapes, CRLF/LF,
 * newlines inside quotes). Input is an iterable of string chunks so large GTFS
 * files never have to be held as a single string.
 */

/** Yields raw rows (arrays of fields) from a sequence of text chunks. */
export function* csvRows(chunks: Iterable<string>): Generator<string[]> {
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  // a quote seen inside a quoted field: either an escaped "" or the closing quote
  let pendingQuote = false;
  let first = true;

  for (let chunk of chunks) {
    if (first) {
      if (chunk.charCodeAt(0) === 0xfeff) chunk = chunk.slice(1);
      first = chunk.length === 0;
    }
    let start = 0;
    for (let i = 0; i < chunk.length; i++) {
      const c = chunk.charCodeAt(i);
      if (pendingQuote) {
        pendingQuote = false;
        if (c === 34) {
          // escaped quote: keep one, continue inside quotes
          field += '"';
          start = i + 1;
          continue;
        }
        inQuotes = false;
        start = i;
      }
      if (inQuotes) {
        if (c === 34) {
          field += chunk.slice(start, i);
          pendingQuote = true;
          start = i + 1;
        }
        continue;
      }
      if (c === 34) {
        field += chunk.slice(start, i);
        inQuotes = true;
        start = i + 1;
      } else if (c === 44) {
        row.push(field + chunk.slice(start, i));
        field = "";
        start = i + 1;
      } else if (c === 10 || c === 13) {
        row.push(field + chunk.slice(start, i));
        field = "";
        start = i + 1;
        // skip the LF of a CRLF pair (and blank lines)
        if (row.length > 1 || row[0] !== "") yield row;
        row = [];
      }
    }
    field += chunk.slice(start);
  }
  if (pendingQuote) inQuotes = false;
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") yield row;
  }
}

/** Yields records keyed by the header row. */
export function* csvRecords(chunks: Iterable<string>): Generator<Record<string, string>> {
  let header: string[] | undefined;
  for (const row of csvRows(chunks)) {
    if (!header) {
      header = row;
      continue;
    }
    const rec: Record<string, string> = {};
    for (let i = 0; i < header.length; i++) rec[header[i]!] = row[i] ?? "";
    yield rec;
  }
}

/** Splits a byte buffer into decoded text chunks (UTF-8, streaming-safe). */
export function* textChunks(bytes: Uint8Array, size = 1 << 20): Generator<string> {
  const decoder = new TextDecoder("utf-8");
  for (let off = 0; off < bytes.length; off += size) {
    yield decoder.decode(bytes.subarray(off, off + size), { stream: off + size < bytes.length });
  }
}
