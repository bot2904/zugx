import { describe, expect, it } from "vite-plus/test";
import { fromLocalInput, toLocalInput } from "./format.ts";
import { normalize, searchKeys } from "./normalize.ts";
import { _setStations, searchStations } from "./stations.ts";
import { dayIndex, daysSummary, runsOnDay, type TrainEntry } from "./trains.ts";
import { b64url, unb64url } from "./url.ts";

describe("normalize", () => {
  it("strips diacritics and punctuation", () => {
    expect(normalize("St. Pölten Hbf")).toBe("st polten hbf");
    expect(normalize("Linz/Donau Hbf")).toBe("linz donau hbf");
  });
  it("adds synonyms and digraphs", () => {
    const keys = searchKeys("Mödling Bahnhof");
    expect(keys).toContain("moedling bahnhof");
    expect(keys).toContain("modling bf");
  });
});

describe("station search", () => {
  _setStations([
    {
      id: "8103000",
      name: "Wien Hbf",
      lat: 48.18,
      lon: 16.37,
      w: 1000,
      alias: ["Wien Hauptbahnhof"],
    },
    { id: "8100516", name: "Wiener Neustadt Hbf", lat: 47.81, lon: 16.23, w: 600 },
    { id: "8100008", name: "St.Pölten Hbf", lat: 48.2, lon: 15.62, w: 800 },
    { id: "8100013", name: "Linz/Donau Hbf", lat: 48.29, lon: 14.29, w: 900 },
  ]);
  it("ranks by match and weight", () => {
    expect(searchStations("wien")[0]?.id).toBe("8103000");
    expect(searchStations("wr neu")[0]?.id).toBe("8100516");
    expect(searchStations("wiener neu")[0]?.id).toBe("8100516");
  });
  it("handles synonyms and umlauts", () => {
    expect(searchStations("sankt poelten")[0]?.id).toBe("8100008");
    expect(searchStations("linz hauptbahnhof")[0]?.id).toBe("8100013");
    expect(searchStations("wien hauptb")[0]?.id).toBe("8103000");
  });
});

describe("time inputs", () => {
  it("round-trips Vienna local time", () => {
    const d = fromLocalInput("2026-07-01T08:30")!;
    expect(d.toISOString()).toBe("2026-07-01T06:30:00.000Z");
    expect(toLocalInput(d)).toBe("2026-07-01T08:30");
    expect(fromLocalInput("2026-01-10T08:30")!.toISOString()).toBe("2026-01-10T07:30:00.000Z");
  });
});

describe("url", () => {
  it("base64url round-trip", () => {
    const s = "¶HKI¶T$A=1@O=Wien Hbf@L=8103000@$202611131224";
    expect(unb64url(b64url(s))).toBe(s);
    expect(b64url(s)).not.toMatch(/[+/=]/);
  });
});

describe("train running days", () => {
  const idx = { begin: "2025-12-14", end: "2026-12-12" };
  const bits = (pred: (i: number) => boolean) => {
    const n = dayIndex(idx.begin, idx.end) + 1;
    const b = new Uint8Array(Math.ceil(n / 8));
    let count = 0;
    for (let i = 0; i < n; i++)
      if (pred(i)) {
        b[i >> 3]! |= 1 << (7 - (i & 7));
        count++;
      }
    return { days: btoa(String.fromCharCode(...b)), n: count };
  };
  const entry = (pred: (i: number) => boolean): TrainEntry => ({
    via: [],
    stops: [],
    op: "oebb",
    cat: "RJ",
    nr: "1",
    from: ["1", "08:00"],
    to: ["2", "09:00"],
    first: idx.begin,
    last: idx.end,
    ...bits(pred),
  });
  const t = {
    weekdays: ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"],
    daily: "daily",
    except: (n: number) => `(-${n})`,
  };
  it("daily", () =>
    expect(
      daysSummary(
        entry(() => true),
        idx,
        t,
      ),
    ).toBe("daily"));
  it("weekdays (2025-12-14 is a Sunday)", () => {
    const e = entry((i) => i % 7 >= 1 && i % 7 <= 5);
    expect(runsOnDay(e, 0)).toBe(false);
    expect(runsOnDay(e, 1)).toBe(true);
    expect(daysSummary(e, idx, t)).toBe("Mo–Fr");
  });
  it("weekends with exceptions", () => {
    const e = entry((i) => (i % 7 === 0 || i % 7 === 6) && i !== 7);
    expect(daysSummary(e, idx, t)).toBe("Sa, Su (-1)");
  });
});
