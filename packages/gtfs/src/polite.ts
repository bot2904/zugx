// A HAFAS client for build scripts: throttled (default ≤ 3 requests/s, ≤ 3 in flight),
// with retry + exponential backoff on network/HTTP/server errors.
import { createClient, HafasError, OEBB_ENDPOINT, type HafasClient } from "@zugx/hafas";

export interface PoliteOptions {
  /** minimum ms between request starts (default 350 → < 3 req/s) */
  interval?: number;
  /** max requests in flight (default 3) */
  concurrency?: number;
  retries?: number;
  log?: (msg: string) => void;
}

/** Errors that mean "no result", not "try again". */
const FINAL_CODES = new Set(["NO_MATCH", "LOCATION", "H890", "H9380", "PROBLEMS", "FAIL", "PARAM"]);

export function isFinalHafasError(e: unknown): boolean {
  if (!(e instanceof HafasError)) return false;
  if (FINAL_CODES.has(e.code)) return true;
  return /nothing found|outside of the timetable|keine/i.test(e.message);
}

export interface PoliteClient {
  client: HafasClient;
  /** number of requests sent */
  readonly count: number;
}

export function politeClient(opts: PoliteOptions = {}): PoliteClient {
  const interval = opts.interval ?? 350;
  const retries = opts.retries ?? 5;
  const log = opts.log ?? console.warn;
  const concurrency = opts.concurrency ?? 3;
  let next = 0;
  let count = 0;
  let inFlight = 0;
  const waiting: (() => void)[] = [];

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  /** wait for a free slot: ≤ `concurrency` in flight, request starts ≥ `interval` ms apart */
  async function acquire() {
    if (inFlight >= concurrency) await new Promise<void>((r) => waiting.push(r));
    inFlight++;
    const start = Math.max(Date.now(), next);
    next = start + interval;
    if (start > Date.now()) await sleep(start - Date.now());
  }
  function release() {
    inFlight--;
    waiting.shift()?.();
  }

  const throttledFetch: typeof fetch = async (input, init) => {
    for (let attempt = 0; ; attempt++) {
      await acquire();
      count++;
      try {
        const res = await fetch(input, init);
        if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
        return res;
      } catch (e) {
        if (attempt >= retries) throw e;
        const backoff = Math.min(60_000, 1000 * 2 ** attempt);
        log(`hafas: ${(e as Error).message}, retry ${attempt + 1}/${retries} in ${backoff} ms`);
        // pause everyone
        next = Math.max(next, Date.now() + backoff);
      } finally {
        release();
      }
    }
  };

  const client = createClient({
    endpoint: OEBB_ENDPOINT,
    headers: { "User-Agent": "zugx (https://zugx.legner.me)" },
    ttl: 0,
    fetch: throttledFetch,
  });
  return {
    client,
    get count() {
      return count;
    },
  };
}
