<script setup lang="ts">
// Bildfahrplan (time–distance diagram) for a corridor: x = km, y = time (downwards).
import { addDays, daysBetween, viennaDate, viennaMinutes, viennaNow } from "../lib/format.ts";
import {
  useDebounceFn,
  useDocumentVisibility,
  useElementSize,
  useIntervalFn,
  useLocalStorage,
  useSessionStorage,
} from "@vueuse/core";
import type { Corridor, CorridorIndex, CorridorIndexEntry, CorridorTrain } from "@zugx/netz";
import { computed, onMounted, onUnmounted, ref, shallowRef, useTemplateRef, watch } from "vue";
import { useI18n } from "../i18n/index.ts";
import { useRoute, useRouter } from "vue-router";
import CorridorIndexView from "../components/CorridorIndex.vue";
import BfTable from "../components/BfTable.vue";
import BfBook from "../components/BfBook.vue";
import BfNode from "../components/BfNode.vue";
import BfCrossings from "../components/BfCrossings.vue";
import BfReserve from "../components/BfReserve.vue";
import BfPunctuality from "../components/BfPunctuality.vue";
import {
  bufferClass,
  crossings,
  lossesOf,
  lossTable,
  runningReserve,
  stopsAt,
} from "../lib/bf-plan.ts";
import { categoryColor } from "../lib/products.ts";
import { trainSlug } from "../lib/url.ts";
import { useKeys } from "../lib/keys.ts";
import type { TipContent } from "../lib/tip.ts";
import { api } from "../lib/api.ts";
import {
  buildRuns,
  lastReported,
  livePaths,
  newLiveState,
  plannedTrain,
  refreshLive,
  trainKey,
  type LiveRun,
} from "../lib/bf-live.ts";
import { loadStations, stationById } from "../lib/stations.ts";

type CorridorRef = Pick<CorridorIndexEntry, "id" | "name" | "oebb" | "lines">;

const files = import.meta.glob<{ default: Corridor }>(
  "../../../../packages/netz/data/corridors/*.toml",
);
const indexFile = Object.entries(files).find(([p]) => p.endsWith("/index.toml"))?.[1] as
  | (() => Promise<{ default: CorridorIndex }>)
  | undefined;

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const list = shallowRef<CorridorRef[]>([]);
const indexData = shallowRef<CorridorIndex>();
const data = shallowRef<Corridor>();
const loading = ref(false);

const id = computed(() => (route.params.corridor ? String(route.params.corridor) : undefined));
const from = computed(() =>
  Number(route.query.from ?? Math.max(0, Math.floor(viennaMinutes() / 60) - 1)),
);
const span = computed(() => Number(route.query.h ?? 4));
// shallow: a deep ref would wrap the train in a proxy, and `hover === r.t` would never match
const hover = shallowRef<CorridorTrain>();

// ---- two windows (e.g. two monitors): ?part=chart | table shows only that part; the windows
// share the sheet, date, time window, section and the hovered train (BroadcastChannel) ----
// ---- planning panels (?plan=knoten …, PLAN.md "Bildfahrplan as a planning tool") ----
const PLANS = ["knoten", "kreuzung", "reserve", "puenktlichkeit"] as const;
type Plan = (typeof PLANS)[number];
const plan = computed<Plan | undefined>(() =>
  (PLANS as readonly string[]).includes(String(route.query.plan))
    ? (route.query.plan as Plan)
    : undefined,
);
const setPlan = (p: Plan) => setQuery({ plan: plan.value === p ? undefined : p });
/** trains of the day shown in the planning panels (category filter applies) */
const planTrains = computed(() =>
  [...trainsOnDate.value, ...hafasOnlyTrains.value].filter((t) => !hidden.value.has(t.cat)),
);
/** node station (?knoten=<id>), default: the major station of the section with most stops */
const nodeIdx = computed(() => {
  const q = stationIdx(route.query.knoten);
  if (q >= 0 && inRange(q)) return q;
  // intermediate major stations first: at the sheet's ends only one direction is on the sheet
  const inner = shownStations.value.slice(1, -1);
  const majors = inner.some((st) => st.major) ? inner.filter((st) => st.major) : inner;
  let best = majors[0]?.i ?? range.value.lo;
  let n = -1;
  for (const st of majors) {
    const c = stopsAt(planTrains.value, st.i).length;
    if (c > n) [best, n] = [st.i, c];
  }
  return best;
});
const setNode = (i: number) => setQuery({ knoten: data.value?.stations[i]?.id });
/** crossings next to single track within the shown section and window */
const crossingList = computed(() => {
  const c = data.value;
  if (plan.value !== "kreuzung" || !c?.tracks) return [];
  return crossings(
    planTrains.value,
    c.stations.map((st) => st.km),
    c.tracks,
    t0.value,
    t1.value,
  ).filter((x) => inRange(x.i) && (x.i2 === undefined || inRange(x.i2)));
});
/** running-time reserve per stretch between stops (whole day, shown section) */
const reserveRows = computed(() => {
  const c = data.value;
  if (plan.value !== "reserve" || !c?.minRun) return [];
  return runningReserve(
    planTrains.value,
    c.minRun,
    c.stations.map((st) => st.km),
    range.value.lo,
    range.value.hi,
  );
});
const delayOf = (tr: CorridorTrain) =>
  liveOn.value ? liveRuns.value.get(trainKey(tr.cat, tr.nr))?.delay : undefined;
/** single-track stretches shaded in the chart (crossings panel) */
const singleBands = computed(() =>
  plan.value === "kreuzung" ? trackRuns.value.filter((r) => r.n === 1) : [],
);

/** timetable tables: Kursbuch layout by default, ?transpose=1 a row per train */
const transposed = computed(() => route.query.transpose === "1");
const part = computed(() =>
  route.query.part === "chart" || route.query.part === "table" ? route.query.part : undefined,
);
const channel =
  typeof BroadcastChannel === "undefined" ? undefined : new BroadcastChannel("zugx:bf");
onUnmounted(() => channel?.close());
type SyncMsg =
  | { kind: "hover"; key: string | null }
  | { kind: "view"; id: string; query: Record<string, string> };
const ownQuery = () =>
  Object.fromEntries(
    Object.entries(route.query).filter(
      (e): e is [string, string] => e[0] !== "part" && typeof e[1] === "string",
    ),
  );
const viewSig = (c: string, q: Record<string, string>) =>
  JSON.stringify([c, Object.entries(q).sort(([a], [b]) => a.localeCompare(b))]);
// what came from the other window is not sent back (no ping-pong while the mouse moves on)
let lastHover: string | null = null;
let lastView = "";
if (channel)
  channel.onmessage = ({ data: m }: MessageEvent<SyncMsg>) => {
    if (m.kind === "hover") {
      lastHover = m.key;
      hover.value = m.key ? trainByKey.value.get(m.key) : undefined;
    } else if (m.kind === "view") {
      if (viewSig(m.id, m.query) === viewSig(id.value ?? "", ownQuery())) return;
      lastView = viewSig(m.id, m.query);
      void router.replace({
        path: `/bf/${m.id}`,
        query: { ...m.query, ...(part.value ? { part: part.value } : {}) },
      });
    }
  };
watch(hover, (h) => {
  const key = h ? trainKey(h.cat, h.nr) : null;
  if (key !== lastHover) channel?.postMessage({ kind: "hover", key } satisfies SyncMsg);
  lastHover = null;
});
watch(
  () => [id.value, route.query] as const,
  ([c]) => {
    if (!c) return;
    const q = ownQuery();
    if (viewSig(c, q) !== lastView)
      channel?.postMessage({ kind: "view", id: c, query: q } satisfies SyncMsg);
    lastView = "";
  },
);
/** opens one part in a new window, this window keeps the other one */
function openPart(p: "chart" | "table") {
  const href = router.resolve({ query: { ...route.query, part: p } }).href;
  window.open(href, "_blank", "popup,width=1280,height=900");
  setQuery({ part: p === "chart" ? "table" : "chart" });
}

// railway lines (VzG) of the current sheet, from the index
const sheetLines = computed(() => list.value.find((c) => c.id === id.value)?.lines ?? []);

/** station name → its departure board (plain clicks in the SPA; Ctrl/⌘/middle click: new tab) */
function openStation(hafasId: string | undefined, e: MouseEvent) {
  if (!hafasId || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  void router.push(`/station/${hafasId}`);
}
const now = shallowRef(viennaNow());
useIntervalFn(() => (now.value = viennaNow()), 30_000);

onMounted(async () => {
  if (indexFile) {
    indexData.value = (await indexFile()).default;
    list.value = indexData.value.corridors;
    // old corridor ids (e.g. /bf/brenner) now live under their ÖBB number
    const alias = id.value ? indexData.value.aliases?.[id.value] : undefined;
    if (alias) void router.replace({ path: `/bf/${alias}`, query: route.query });
  } else {
    list.value = Object.keys(files)
      .map((p) => /corridors\/([^/]+)\.toml$/.exec(p)?.[1])
      .filter((x): x is string => !!x && x !== "index")
      .map((x) => ({ id: x, name: x }));
  }
});

// date and time window (?d, ?from, ?h) survive switching sheets, e.g. back to the index and into
// another sheet: remembered for the browser tab (sessionStorage)
const VIEW_KEYS = ["d", "from", "h"] as const;
const savedView = useSessionStorage<Record<string, string>>("zugx:bf-view", {});
watch(
  [id, () => route.query],
  ([c, q], old) => {
    if (!c) return;
    const has = VIEW_KEYS.some((k) => typeof q[k] === "string");
    // only when another sheet opens (not when e.g. "Today" removes ?d on this one)
    if (!has && c !== old?.[0] && Object.keys(savedView.value).length) {
      void router.replace({ query: { ...savedView.value, ...q } });
      return;
    }
    const v: Record<string, string> = {};
    for (const k of VIEW_KEYS) if (typeof q[k] === "string") v[k] = q[k];
    savedView.value = v;
  },
  { immediate: true },
);

watch(
  id,
  async (c) => {
    if (!c) return;
    const loader = Object.entries(files).find(([p]) => p.endsWith(`/${c}.toml`))?.[1];
    if (!loader) return;
    loading.value = true;
    data.value = (await loader()).default;
    loading.value = false;
  },
  { immediate: true },
);

function setQuery(patch: Record<string, string | number | undefined>) {
  const q: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...route.query, ...patch }))
    if (v !== undefined) q[k] = String(v);
  void router.replace({ query: q });
}

// layout
// width follows the page (full document width, 1 SVG unit = 1 px, text stays 10 px); at least 800
const chartBox = useTemplateRef<HTMLElement>("chartBox");
const { width: boxWidth } = useElementSize(chartBox);
// Maßstab (time axis): 1× = 630 px plot height, 2×/4× stretch the time axis (page scrolls), ?y=
const SCALES = [1, 2, 4] as const;
const scale = computed(() => {
  const v = Number(route.query.y);
  return (SCALES as readonly number[]).includes(v) ? v : 1;
});
const setScale = (v: number) => setQuery({ y: v === 1 ? undefined : v });
const W = computed(() => Math.max(800, Math.round(boxWidth.value) || 1100));
const M = { top: 110, right: 20, bottom: 20, left: 46 };
const H = computed(() => M.top + M.bottom + (760 - M.top - M.bottom) * scale.value);
// ---- section: first/last station (?a=, ?b= station ids) and direction (?rev=1) ----
const stationIdx = (sid: unknown) =>
  typeof sid === "string" ? (data.value?.stations.findIndex((st) => st.id === sid) ?? -1) : -1;
const range = computed(() => {
  const n = data.value?.stations.length ?? 0;
  let lo = stationIdx(route.query.a);
  let hi = stationIdx(route.query.b);
  if (lo < 0) lo = 0;
  if (hi < 0) hi = Math.max(0, n - 1);
  if (lo > hi) [lo, hi] = [hi, lo];
  return { lo, hi };
});
const reversed = computed(() => route.query.rev === "1");
/** stations of the shown section, in display order (left → right) */
const shownStations = computed(() => {
  const all = data.value?.stations ?? [];
  const part = all
    .slice(range.value.lo, range.value.hi + 1)
    .map((st, k) => ({ ...st, i: range.value.lo + k }));
  return reversed.value ? part.reverse() : part;
});
/** single/double track runs within the shown section, in chart x */
const trackRuns = computed(() => {
  const lo = Math.min(kmLo.value, kmHi.value);
  const hi = Math.max(kmLo.value, kmHi.value);
  const st = data.value?.stations ?? [];
  // the stretch named by the stations at (or just inside) its ends
  const before = (km: number) => st.findLast((s) => s.km <= km + 0.6)?.name ?? "";
  const after = (km: number) => st.find((s) => s.km >= km - 0.6)?.name ?? "";
  return (data.value?.tracks ?? []).flatMap(([a, b, n]) => {
    const [ca, cb] = [Math.max(a, lo), Math.min(b, hi)];
    if (cb <= ca) return [];
    const [x1, x2] = [x(ca), x(cb)].sort((p, q) => p - q) as [number, number];
    const [from, to] = reversed.value ? [after(cb), before(ca)] : [before(ca), after(cb)];
    return [{ x1, x2, n, from, to }];
  });
});
const kmLo = computed(() => data.value?.stations[range.value.lo]?.km ?? 0);
const kmHi = computed(() => data.value?.stations[range.value.hi]?.km ?? 1);
const x = (km: number) => {
  const span = Math.max(1, kmHi.value - kmLo.value);
  const rel = reversed.value ? kmHi.value - km : km - kmLo.value;
  return M.left + (rel / span) * (W.value - M.left - M.right);
};
const inRange = (i: number) => i >= range.value.lo && i <= range.value.hi;
/** first/last station as shown (left/right): direction follows from their order on the corridor */
function setSection(firstId: string, lastId: string) {
  const ia = stationIdx(firstId);
  const ib = stationIdx(lastId);
  if (ia < 0 || ib < 0 || ia === ib) return;
  const [lo, hi] = ia < ib ? [ia, ib] : [ib, ia];
  const st = data.value?.stations ?? [];
  setQuery({
    a: lo > 0 ? st[lo]?.id : undefined,
    b: hi < st.length - 1 ? st[hi]?.id : undefined,
    rev: ia > ib ? "1" : undefined,
  });
}
/** all corridor stations in display direction (for the from/to pickers) */
const orderedStations = computed(() => {
  const all = data.value?.stations ?? [];
  return reversed.value ? [...all].reverse() : all;
});
const swap = () => setQuery({ rev: reversed.value ? undefined : "1" });
const resetSection = () => setQuery({ a: undefined, b: undefined, rev: undefined });
// window start in minutes; follows ?from= (hours, may be fractional), moved live by the wheel
const startMin = ref(from.value * 60);
watch(from, (f) => (startMin.value = f * 60));
const t0 = computed(() => startMin.value);
const t1 = computed(() => t0.value + span.value * 60);
const y = (min: number) =>
  M.top + ((min - t0.value) / (t1.value - t0.value)) * (H.value - M.top - M.bottom);

/**
 * Time grid: solid hour lines, dashed half-hour and (where at least 6 px apart) 10-minute lines;
 * labels at every hour, at 10/30 minutes only where there is room.
 */
const hourTicks = computed(() => {
  const out: { y: number; label: string; kind: "hour" | "half" | "ten"; labelled: boolean }[] = [];
  const px10 = y(t0.value + 10) - y(t0.value);
  const step = px10 >= 6 ? 10 : 30;
  for (let m = Math.ceil(t0.value / step) * step; m <= t1.value; m += step) {
    const kind = m % 60 === 0 ? "hour" : m % 30 === 0 ? "half" : "ten";
    out.push({
      y: y(m),
      label: `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`,
      kind,
      labelled: kind === "hour" || (kind === "half" ? px10 * 3 >= 14 : px10 >= 14),
    });
  }
  return out;
});

interface Drawn {
  t: CorridorTrain;
  d: string;
  color: string;
  label?: { x: number; y: number };
  /** realtime run of this train (live overlay) */
  live?: LiveRun;
}

// ---- date: any day of the timetable period (trains carry running-day bitsets) ----
const today = viennaDate();
const date = computed(() => {
  const q = typeof route.query.d === "string" ? route.query.d : "";
  const c = data.value;
  if (/^\d{4}-\d\d-\d\d$/.test(q)) return q;
  if (c?.begin && today >= c.begin && today <= c.end) return today;
  return c?.day ?? today;
});
const dayIdx = computed(() => (data.value?.begin ? daysBetween(data.value.begin, date.value) : -1));
const bitsCache = new WeakMap<CorridorTrain, Uint8Array>();
function runsOnDate(t: CorridorTrain): boolean {
  if (!t.days) return true;
  let b = bitsCache.get(t);
  if (!b) bitsCache.set(t, (b = Uint8Array.from(atob(t.days), (ch) => ch.charCodeAt(0))));
  const i = dayIdx.value;
  return i >= 0 && ((b[i >> 3] ?? 0) >> (7 - (i & 7))) % 2 === 1;
}
const trainsOnDate = computed(() => (data.value?.trains ?? []).filter(runsOnDate));
function shiftDay(delta: number) {
  setQuery({ d: addDays(date.value, delta) });
}
/** window start from the time input (HH:MM) */
function setStartTime(v: string) {
  const m = /^(\d\d):(\d\d)/.exec(v);
  if (m) setQuery({ from: Math.round((Number(m[1]) + Number(m[2]) / 60) * 100) / 100 });
}
/** window start ± hours (whole hours: from 7.5, one earlier is 7, one later 8) */
function shiftHour(delta: number) {
  const f = from.value;
  const next = delta < 0 ? Math.ceil(f) + delta : Math.floor(f) + delta;
  const max = Math.max(0, 28 - span.value); // trains after midnight run up to ~28:00
  setQuery({ from: Math.min(max, Math.max(0, next)) });
}
// zapping: ←/→ day, ↑/↓ two hours, h/l one hour, Shift+↑/↓ a whole window, n = now
useKeys({
  ArrowLeft: () => id.value && shiftDay(-1),
  ArrowRight: () => id.value && shiftDay(1),
  ArrowUp: (e) => id.value && shiftHour(e.shiftKey ? -span.value : -2),
  ArrowDown: (e) => id.value && shiftHour(e.shiftKey ? span.value : 2),
  h: () => id.value && shiftHour(-1),
  l: () => id.value && shiftHour(1),
  "+": () =>
    id.value &&
    setScale(SCALES[Math.min(SCALES.length - 1, SCALES.indexOf(scale.value as 1) + 1)]!),
  "-": () => id.value && setScale(SCALES[Math.max(0, SCALES.indexOf(scale.value as 1) - 1)]!),
  n: () =>
    id.value && setQuery({ d: undefined, from: Math.max(0, Math.floor(viennaMinutes() / 60) - 1) }),
});
const isToday = computed(() => date.value === today);
const weekday = computed(() =>
  Temporal.PlainDate.from(date.value).toLocaleString(locale.value, { weekday: "short" }),
);

// ---- live overlay (?live=1, today only): realtime paths from HAFAS, see lib/bf-live.ts ----
// the table-only window (second monitor) draws no live paths and fetches none
const liveOn = computed(() => route.query.live === "1" && isToday.value && part.value !== "table");
const liveRuns = shallowRef(new Map<string, LiveRun>());
const liveBusy = ref(false);
const liveError = ref(false);
let liveState = newLiveState();
let liveRound = 0;
const visibility = useDocumentVisibility();
/** bounding box of the shown section's stations (+ ~3 km), for the radar request */
async function sectionBbox() {
  await loadStations();
  const pts = shownStations.value
    .map((s) => (s.hafasId ? stationById(s.hafasId) : undefined))
    .filter((s) => s !== undefined);
  if (!pts.length) return undefined;
  const lats = pts.map((p) => p.lat);
  const lons = pts.map((p) => p.lon);
  return {
    north: Math.max(...lats) + 0.03,
    south: Math.min(...lats) - 0.03,
    west: Math.min(...lons) - 0.04,
    east: Math.max(...lons) + 0.04,
  };
}
async function updateLive() {
  const c = data.value;
  if (!liveOn.value || !c || liveBusy.value || visibility.value === "hidden") return;
  const round = ++liveRound;
  const st = liveState;
  const nowMin = viennaMinutes(viennaNow());
  const publish = () => {
    if (round === liveRound && st === liveState)
      liveRuns.value = buildRuns(st, trainsOnDate.value, c.stations, nowMin);
  };
  liveBusy.value = true;
  try {
    await refreshLive({
      client: api(true),
      st,
      day: date.value,
      nowMin,
      t0: t0.value,
      t1: t1.value,
      stations: c.stations,
      lo: range.value.lo,
      hi: range.value.hi,
      bbox: await sectionBbox(),
      trains: trainsOnDate.value,
      onProgress: publish,
    });
    publish();
    liveError.value = false;
  } catch {
    liveError.value = true;
  } finally {
    liveBusy.value = false;
  }
}
// new corridor or day: start over; window/section changes: fetch only what is new
watch([id, date], () => {
  liveState = newLiveState();
  liveRuns.value = new Map();
});
const updateLiveSoon = useDebounceFn(updateLive, 500);
watch([liveOn, data, t0, t1, range], () => void updateLiveSoon(), { immediate: true });
watch(visibility, (v) => v === "visible" && void updateLiveSoon());
useIntervalFn(() => void updateLive(), 60_000);
// punctuality: delay gained per stretch/stop from the live runs, collected in this browser
// (sheet → day → train → [from, to, gain]), the last 7 days
type LossStore = Record<string, Record<string, Record<string, [number, number, number][]>>>;
const lossStore = useLocalStorage<LossStore>("zugx:bf-punct", {});
watch(liveRuns, (runs) => {
  const c = id.value;
  if (!c || !liveOn.value || !runs.size) return;
  const nowMin = viennaMinutes(viennaNow());
  const day = { ...lossStore.value[c]?.[date.value] };
  let changed = false;
  for (const r of runs.values()) {
    const l = lossesOf(r.pts, nowMin).map((x) => [x.i, x.j, x.gain] as [number, number, number]);
    if (l.length && l.length >= (day[r.key]?.length ?? 0)) {
      day[r.key] = l;
      changed = true;
    }
  }
  if (!changed) return;
  const keep = addDays(today, -7);
  const sheet = Object.fromEntries(
    Object.entries({ ...lossStore.value[c], [date.value]: day }).filter(([d]) => d >= keep),
  );
  lossStore.value = { ...lossStore.value, [c]: sheet };
});
const punctuality = computed(() => {
  const sheet = (id.value && lossStore.value[id.value]) || {};
  const samples = Object.values(sheet).flatMap((day) =>
    Object.values(day).map((l) =>
      l.map(([i, j, gain]) => ({ i, j, gain })).filter((x) => inRange(x.i) && inRange(x.j)),
    ),
  );
  return {
    rows: lossTable(samples),
    days: Object.keys(sheet).length,
    runs: samples.length,
  };
});
function toggleLive() {
  setQuery({ live: route.query.live === "1" ? undefined : "1" });
}
/** trains known from HAFAS only (WESTbahn & co.), drawn with their planned times */
const hafasOnlyTrains = computed(() =>
  liveOn.value ? [...liveRuns.value.values()].filter((r) => r.hafasOnly).map(plannedTrain) : [],
);
const drawnByKey = computed(
  () => new Map(drawn.value.map((r) => [trainKey(r.t.cat, r.t.nr), r.t] as const)),
);
const hoverDrawn = computed(() =>
  hover.value ? drawn.value.find((r) => r.t === hover.value) : undefined,
);
/** tooltip of a train: number, route, and with Live its delay and last report */
function trainTip(tr: CorridorTrain): TipContent {
  const live = liveOn.value ? liveRuns.value.get(trainKey(tr.cat, tr.nr)) : undefined;
  const rep = live ? lastReported(live, viennaMinutes(now.value)) : undefined;
  return {
    badge: { text: `${tr.cat} ${tr.nr}`, color: categoryColor(tr.cat) },
    lines: [
      [tr.origin, tr.headsign].filter(Boolean).join(" → "),
      live &&
        `${t("bf.live")}: ${
          live.delay === undefined
            ? t("bf.liveNoRt")
            : live.delay
              ? `+${live.delay}′`
              : t("bf.liveOnTime")
        }`,
      rep?.last &&
        t("bf.liveAt", {
          n: rep.stations,
          station: data.value?.stations[rep.last.i]?.name ?? "",
          time: hhmmOf(rep.last.rt),
        }),
      live?.hafasOnly && t("bf.hafasOnly"),
    ],
  };
}
const liveDrawn = computed(() => {
  const c = data.value;
  if (!c || !liveOn.value) return [];
  const nowMin = viennaMinutes(now.value);
  const xi = (i: number) => (inRange(i) && c.stations[i] ? x(c.stations[i].km) : undefined);
  return [...liveRuns.value.values()]
    .filter((r) => !hidden.value.has(r.cat))
    .map((r) => ({ r, color: categoryColor(r.cat), ...livePaths(r, xi, y, nowMin) }))
    .filter((p) => p.past || p.future);
});

const drawn = computed<Drawn[]>(() => {
  const c = data.value;
  if (!c) return [];
  const out: Drawn[] = [];
  for (const t of [...trainsOnDate.value, ...hafasOnlyTrains.value]) {
    const coords: [number, number][] = [];
    for (const [i, a, d] of t.pts) {
      const st = c.stations[i];
      if (!st || !inRange(i)) continue;
      if (a !== null) coords.push([x(st.km), y(a)]);
      if (d !== null && d !== a) coords.push([x(st.km), y(d)]);
      else if (d !== null && a === null) coords.push([x(st.km), y(d)]);
    }
    const times = t.pts
      .filter(([i]) => inRange(i))
      .flatMap(([, a, d]) => [a, d])
      .filter((v): v is number => v !== null);
    if (!times.length || Math.max(...times) < t0.value || Math.min(...times) > t1.value) continue;
    if (coords.length < 2) continue;
    const path = coords
      .map(([px, py], k) => `${k ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`)
      .join("");
    const mid = coords[Math.floor(coords.length / 2)];
    const live = liveOn.value ? liveRuns.value.get(trainKey(t.cat, t.nr)) : undefined;
    out.push({
      t,
      d: path,
      color: categoryColor(t.cat),
      label: mid ? { x: mid[0], y: mid[1] } : undefined,
      ...(live ? { live } : {}),
    });
  }
  return out;
});

const nowY = computed(() => {
  if (!isToday.value) return undefined;
  const n = viennaMinutes(now.value);
  return n >= t0.value && n <= t1.value ? y(n) : undefined;
});

const hhmmOf = (min: number) =>
  `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(Math.round(min % 60)).padStart(2, "0")}`;

/**
 * Mouse wheel / trackpad over the diagram scrolls the time axis (10 % of the window per notch);
 * Ctrl/⌘ + wheel (incl. trackpad pinch) zooms between 1 and 24 hours.
 */
const syncFrom = useDebounceFn(
  () => setQuery({ from: Math.round((startMin.value / 60) * 100) / 100 }),
  300,
);
function onWheel(e: WheelEvent) {
  if (e.shiftKey) return; // horizontal scrolling of a wide diagram
  e.preventDefault();
  const delta = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY; // lines → px
  if (e.ctrlKey || e.metaKey) {
    const h = Math.min(24, Math.max(1, span.value * Math.exp(delta / 300)));
    setQuery({ h: Math.round(h * 4) / 4 });
    return;
  }
  const maxStart = Math.max(0, 28 * 60 - span.value * 60); // trains after midnight run up to ~28:00
  startMin.value = Math.min(maxStart, Math.max(0, startMin.value + (delta / 100) * span.value * 6));
  void syncFrom();
}

function openTrain(t: CorridorTrain) {
  void router.push({ path: `/train/${trainSlug(`${t.cat} ${t.nr}`)}`, query: { d: date.value } });
}

const trainByKey = computed(
  () =>
    new Map(
      [...trainsOnDate.value, ...hafasOnlyTrains.value].map((t) => [trainKey(t.cat, t.nr), t]),
    ),
);
const cats = computed(() => [
  ...new Set([...trainsOnDate.value, ...hafasOnlyTrains.value].map((t) => t.cat)),
]);
const hidden = ref(new Set<string>());
function toggleCat(c: string) {
  const s = new Set(hidden.value);
  if (s.has(c)) s.delete(c);
  else s.add(c);
  hidden.value = s;
}
</script>

<template>
  <CorridorIndexView v-if="!id && indexData" :index="indexData" />
  <section v-else-if="id">
    <div class="flex flex-wrap items-center gap-2">
      <h1 class="m-0 text-xl">
        <RouterLink to="/bf" class="text-[var(--fg)]">{{ $t("bf.title") }}</RouterLink>
      </h1>
      <select
        class="input text-sm"
        :value="id"
        :aria-label="$t('bf.corridor')"
        @change="
          router.push({
            path: `/bf/${($event.target as HTMLSelectElement).value}`,
            query: route.query,
          })
        "
      >
        <option v-for="c in list" :key="c.id" :value="c.id">
          {{ c.oebb ? `${c.oebb} · ` : "" }}{{ c.name }}
        </option>
      </select>
    </div>
    <div v-if="data" class="mt-2 flex flex-wrap items-center gap-1 text-xs">
      <label class="flex items-center gap-1">
        {{ $t("search.from") }}
        <select
          class="input max-w-56 text-xs"
          :value="shownStations[0]?.id"
          @change="setSection(($event.target as HTMLSelectElement).value, shownStations.at(-1)!.id)"
        >
          <option v-for="st in orderedStations" :key="st.id" :value="st.id">{{ st.name }}</option>
        </select>
      </label>
      <button class="btn" v-tip="$t('bf.swap')" :aria-label="$t('bf.swap')" @click="swap">⇄</button>
      <label class="flex items-center gap-1">
        {{ $t("search.to") }}
        <select
          class="input max-w-56 text-xs"
          :value="shownStations.at(-1)?.id"
          @change="setSection(shownStations[0]!.id, ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="st in orderedStations" :key="st.id" :value="st.id">{{ st.name }}</option>
        </select>
      </label>
      <button
        v-if="route.query.a || route.query.b || route.query.rev"
        class="btn"
        @click="resetSection"
      >
        {{ $t("bf.fullRoute") }}
      </button>
      <span class="muted"
        >{{ Math.round(Math.abs(kmHi - kmLo)) }} km · {{ shownStations.length }}
        {{ $t("bf.stations") }}</span
      >
      <!-- railway lines (VzG/Streckennummern) through this sheet's stations, from the build -->
      <span v-if="sheetLines.length" class="muted text-xs">
        · {{ $t("bf.lines") }}:
        <template v-for="(l, i) in sheetLines" :key="l.id"
          ><template v-if="i"> · </template
          ><RouterLink :to="`/vzg/${l.id}`" v-tip="$t('bf.vzgTip')"
            ><span v-if="l.ref" class="mono">{{ l.ref }}</span>{{ l.ref && l.name ? " " : ""
            }}{{ l.name }}</RouterLink
          ></template
        >
      </span>
    </div>
    <!-- date and time window in one row; widths stay fixed while zapping (no jumping controls) -->
    <div v-if="data" class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <span class="flex items-center gap-1">
        <button
          class="btn"
          v-tip="`${$t('bf.prevDay')} (←)`"
          :aria-label="$t('bf.prevDay')"
          @click="shiftDay(-1)"
        >
          ←
        </button>
        <input
          type="date"
          class="input text-xs"
          :value="date"
          :min="data.begin"
          :max="data.end"
          :aria-label="$t('trains.runsOn')"
          @change="setQuery({ d: ($event.target as HTMLInputElement).value || undefined })"
        />
        <span class="mono muted inline-block min-w-[3ch]">{{ weekday }}</span>
        <button
          class="btn"
          v-tip="`${$t('bf.nextDay')} (→)`"
          :aria-label="$t('bf.nextDay')"
          @click="shiftDay(1)"
        >
          →
        </button>
        <button
          class="btn"
          :class="isToday && 'invisible'"
          :aria-hidden="isToday"
          :tabindex="isToday ? -1 : undefined"
          @click="setQuery({ d: undefined })"
        >
          {{ $t("trains.today") }}
        </button>
      </span>
      <span class="flex items-center gap-1">
        <button
          class="btn"
          v-tip="`${$t('bf.hourEarlier')} (↑)`"
          :aria-label="$t('bf.hourEarlier')"
          @click="shiftHour(-2)"
        >
          ↑
        </button>
        <input
          type="time"
          class="input mono text-xs"
          :value="hhmmOf(startMin)"
          :aria-label="$t('bf.startTime')"
          v-tip="$t('bf.wheelHint')"
          @change="setStartTime(($event.target as HTMLInputElement).value)"
        />
        <button
          class="btn"
          v-tip="`${$t('bf.hourLater')} (↓)`"
          :aria-label="$t('bf.hourLater')"
          @click="shiftHour(2)"
        >
          ↓
        </button>
        <button
          v-for="h in [2, 4, 8, 24]"
          :key="h"
          class="btn"
          :class="span === h && 'btn-on'"
          @click="setQuery({ h, from: h === 24 ? 0 : from })"
        >
          {{ h }}h
        </button>
      </span>
      <span class="flex items-center gap-1" role="group" :aria-label="$t('bf.scale')">
        <span class="muted">{{ $t("bf.scale") }}</span>
        <button
          v-for="v in SCALES"
          :key="v"
          class="btn"
          :class="scale === v && 'btn-on'"
          :aria-pressed="scale === v"
          v-tip="`${$t('bf.scaleTip')} (+/−)`"
          @click="setScale(v)"
        >
          {{ v }}×
        </button>
      </span>
      <span class="muted tabular-nums">{{ $t("bf.trainsOnDay", { n: trainsOnDate.length }) }}</span>
      <span v-if="data.begin && (date < data.begin || date > data.end)" class="text-[var(--warn)]">
        {{ $t("bf.outside", { begin: data.begin, end: data.end }) }}
      </span>
    </div>
    <div class="my-2 flex flex-wrap gap-1 text-xs">
      <button
        class="btn"
        :class="liveOn && 'btn-on'"
        :aria-pressed="liveOn"
        :disabled="!isToday"
        v-tip="isToday ? $t('bf.liveTip') : $t('bf.liveOnlyToday')"
        @click="toggleLive"
      >
        <span aria-hidden="true">●</span> {{ $t("bf.live") }}
      </button>
      <span v-if="liveOn" class="muted self-center" role="status">
        <template v-if="liveError">{{ $t("bf.liveError") }}</template>
        <template v-else-if="liveBusy && !liveRuns.size">…</template>
        <template v-else>{{ $t("bf.liveCount", { n: liveDrawn.length }) }}</template>
      </span>
      <span class="chips flex flex-wrap gap-1">
        <button
          v-for="c in cats"
          :key="c"
          class="btn chip py-0.5 text-xs"
          :class="hidden.has(c) && 'muted line-through'"
          :style="{ borderColor: categoryColor(c) }"
          @click="toggleCat(c)"
        >
          {{ c }}
        </button>
      </span>
    </div>

    <p v-if="!list.length && !loading" class="muted">{{ $t("bf.noData") }}</p>
    <div v-if="data" class="no-print mt-1 flex justify-end gap-1 text-xs">
      <button v-if="part" class="btn" @click="setQuery({ part: undefined })">
        {{ $t("bf.showBoth") }}
      </button>
      <button v-else class="btn" v-tip="$t('bf.newWindowTip')" @click="openPart('chart')">
        ⧉ {{ $t("bf.chartNewWindow") }}
      </button>
    </div>
    <div v-if="data && part !== 'table'" ref="chartBox" class="card overflow-x-auto p-1">
      <svg
        :viewBox="`0 0 ${W} ${H}`"
        class="block"
        :style="{ width: `${W}px` }"
        role="img"
        :aria-label="data.name"
        @wheel="onWheel"
      >
        <!-- stations -->
        <g v-for="s in shownStations" :key="s.id">
          <line
            :x1="x(s.km)"
            :x2="x(s.km)"
            :y1="M.top - 4"
            :y2="H - M.bottom"
            :stroke="
              plan === 'knoten' && s.i === nodeIdx
                ? 'var(--accent)'
                : s.major
                  ? 'var(--muted)'
                  : 'var(--line)'
            "
            :stroke-width="plan === 'knoten' && s.i === nodeIdx ? 2 : s.major ? 1 : 0.6"
          />
          <!-- station name → live departure board -->
          <a
            :href="s.hafasId ? `/station/${s.hafasId}` : undefined"
            class="bf-station"
            @click="
              plan === 'knoten'
                ? ($event.preventDefault(), setNode(s.i))
                : openStation(s.hafasId, $event)
            "
            v-tip="
              plan === 'knoten'
                ? { title: s.name, lines: [$t('bf.plan.pickNode')] }
                : s.hafasId
                  ? { title: s.name, lines: [`${$t('search.board')} →`] }
                  : s.name
            "
          >
            <text
              :transform="`translate(${x(s.km) + 3} ${M.top - 8}) rotate(-60)`"
              font-size="10"
              :fill="s.major ? 'var(--fg)' : 'var(--muted)'"
              :font-weight="s.major ? 600 : 400"
            >
              {{ s.name }}
            </text>
          </a>
        </g>
        <!-- single / double track along the top edge: one line or two parallel lines -->
        <g class="bf-tracks">
          <g
            v-for="(tk, k) in trackRuns"
            :key="k"
            v-tip="{
              title: tk.n === 2 ? $t('vzg.double') : $t('vzg.single'),
              lines: [`${tk.from} – ${tk.to}`],
            }"
            data-tip-at="pointer"
          >
            <rect :x="tk.x1" :y="M.top - 8" :width="tk.x2 - tk.x1" height="8" fill="transparent" />
            <line :x1="tk.x1" :x2="tk.x2" :y1="M.top - 5" :y2="M.top - 5" />
            <line v-if="tk.n === 2" :x1="tk.x1" :x2="tk.x2" :y1="M.top - 2" :y2="M.top - 2" />
          </g>
        </g>
        <!-- time -->
        <g class="mono" font-size="10">
          <g v-for="tk in hourTicks" :key="tk.label">
            <line
              :x1="M.left"
              :x2="W - M.right"
              :y1="tk.y"
              :y2="tk.y"
              :class="`bf-grid bf-grid-${tk.kind}`"
            />
            <text
              v-if="tk.labelled"
              :x="M.left - 4"
              :y="tk.y + 3"
              text-anchor="end"
              :fill="tk.kind === 'hour' ? 'var(--fg)' : 'var(--muted)'"
            >
              {{ tk.label }}
            </text>
          </g>
        </g>
        <line
          v-if="nowY"
          :x1="M.left"
          :x2="W - M.right"
          :y1="nowY"
          :y2="nowY"
          stroke="var(--accent)"
          stroke-dasharray="4 3"
        />
        <!-- trains -->
        <clipPath id="plot">
          <rect
            :x="M.left"
            :y="M.top"
            :width="W - M.left - M.right"
            :height="H - M.top - M.bottom"
          />
        </clipPath>
        <g clip-path="url(#plot)">
          <g
            v-for="(r, i) in drawn.filter((r) => !hidden.has(r.t.cat))"
            :key="i"
            class="cursor-pointer"
            v-tip="trainTip(r.t)"
            data-tip-at="pointer"
            @mouseenter="hover = r.t"
            @mouseleave="hover = undefined"
            @click="openTrain(r.t)"
          >
            <path :d="r.d" fill="none" stroke="transparent" stroke-width="8" />
            <path
              :d="r.d"
              fill="none"
              :stroke="r.color"
              :stroke-width="
                hover === r.t ? 3 : r.live || ['S', 'R', 'REX', 'CJX'].includes(r.t.cat) ? 1 : 1.6
              "
              :opacity="hover && hover !== r.t ? 0.35 : r.live && hover !== r.t ? 0.25 : 1"
              :stroke-dasharray="r.live?.hafasOnly ? '1 2' : undefined"
            />
            <text
              v-if="r.label && span <= 8"
              :x="r.label.x + 3"
              :y="r.label.y - 2"
              font-size="8"
              :fill="r.color"
              class="mono"
            >
              {{ r.t.cat }} {{ r.t.nr }}
            </text>
          </g>
          <!-- crossings panel: single track shaded, crossings as dots (buffer colour), conflicts ✕ -->
          <rect
            v-for="(b, k) in singleBands"
            :key="`sb${k}`"
            :x="b.x1"
            :y="M.top"
            :width="b.x2 - b.x1"
            :height="H - M.top - M.bottom"
            class="bf-single pointer-events-none"
          />
          <g v-for="(c, k) in crossingList" :key="`x${k}`" class="pointer-events-none">
            <text
              v-if="c.conflict"
              :x="x(c.km)"
              :y="y(c.time) + 4"
              text-anchor="middle"
              font-size="13"
              font-weight="700"
              fill="var(--bad)"
            >
              ✕
            </text>
            <circle
              v-else
              :cx="x(c.km)"
              :cy="y(c.time)"
              r="4"
              :class="`bf-cross ${bufferClass(Math.min(c.bufUp ?? 99, c.bufDown ?? 99))}`"
            />
          </g>
          <!-- hovered train once more on top, so crossing trains don't cover it -->
          <path
            v-if="hoverDrawn"
            :d="hoverDrawn.d"
            fill="none"
            :stroke="hoverDrawn.color"
            stroke-width="3"
            stroke-linejoin="round"
            :stroke-dasharray="hoverDrawn.live?.hafasOnly ? '1 2' : undefined"
            class="pointer-events-none"
          />
          <!-- live overlay: actual path (solid) and forecast (dashed), delay at "now" -->
          <g v-for="p in liveDrawn" :key="`live-${p.r.key}`" class="pointer-events-none">
            <path
              :d="p.past"
              fill="none"
              :stroke="p.color"
              stroke-width="2.6"
              stroke-linejoin="round"
              :opacity="hover && hover !== drawnByKey.get(p.r.key) ? 0.35 : 1"
            />
            <path
              :d="p.future"
              fill="none"
              :stroke="p.color"
              stroke-width="2"
              stroke-dasharray="5 3"
              :opacity="hover && hover !== drawnByKey.get(p.r.key) ? 0.35 : 0.9"
            />
            <circle
              v-for="([cx, cy], k) in p.dots"
              :key="k"
              :cx="cx"
              :cy="cy"
              r="3"
              :fill="p.color"
              stroke="var(--bg2)"
              stroke-width="1"
              :opacity="hover && hover !== drawnByKey.get(p.r.key) ? 0.35 : 1"
            />
            <text
              v-if="p.end && p.r.delay"
              :x="p.end[0] + 3"
              :y="p.end[1] + 3"
              font-size="9"
              font-weight="700"
              class="mono"
              :fill="p.r.delay >= 5 ? 'var(--bad)' : 'var(--warn)'"
            >
              +{{ p.r.delay }}
            </text>
          </g>
        </g>
      </svg>
    </div>
    <!-- live legend: what is reported, what is interpolated, what is only planned -->
    <p v-if="liveOn" class="muted my-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <span class="inline-flex items-center gap-1">
        <svg width="26" height="8" aria-hidden="true">
          <line x1="1" x2="25" y1="4" y2="4" stroke="var(--fg)" stroke-width="2.6" />
          <circle cx="13" cy="4" r="3" fill="var(--fg)" stroke="var(--bg)" stroke-width="1" />
        </svg>
        {{ $t("bf.legendReported") }}
      </span>
      <span class="inline-flex items-center gap-1">
        <svg width="26" height="8" aria-hidden="true">
          <line x1="1" x2="25" y1="4" y2="4" stroke="var(--fg)" stroke-width="2.6" />
        </svg>
        {{ $t("bf.legendActual") }}
      </span>
      <span class="inline-flex items-center gap-1">
        <svg width="26" height="8" aria-hidden="true">
          <line
            x1="1"
            x2="25"
            y1="4"
            y2="4"
            stroke="var(--fg)"
            stroke-width="2"
            stroke-dasharray="5 3"
          />
        </svg>
        {{ $t("bf.legendForecast") }}
      </span>
      <span class="inline-flex items-center gap-1">
        <svg width="26" height="8" aria-hidden="true">
          <line x1="1" x2="25" y1="4" y2="4" stroke="var(--fg)" stroke-width="1" opacity="0.35" />
        </svg>
        {{ $t("bf.legendPlanned") }}
      </span>
      <span class="inline-flex items-center gap-1">
        <svg width="26" height="8" aria-hidden="true">
          <line
            x1="1"
            x2="25"
            y1="4"
            y2="4"
            stroke="var(--fg)"
            stroke-width="1"
            stroke-dasharray="1 2"
            opacity="0.6"
          />
        </svg>
        {{ $t("bf.legendHafasOnly") }}
      </span>
    </p>
    <!-- planning: analyses of the shown timetable -->
    <div
      v-if="data && part !== 'table'"
      class="no-print mt-2 flex flex-wrap items-center gap-1 text-xs"
    >
      <span class="muted">{{ $t("bf.plan.title") }}:</span>
      <button
        v-for="p in PLANS"
        :key="p"
        class="btn"
        :class="plan === p && 'btn-on'"
        :aria-pressed="plan === p"
        @click="setPlan(p)"
      >
        {{ $t(`bf.plan.tab.${p}`) }}
      </button>
    </div>
    <BfPunctuality
      v-if="data && plan === 'puenktlichkeit' && part !== 'table'"
      :stations="data.stations"
      :rows="punctuality.rows"
      :days="punctuality.days"
      :runs="punctuality.runs"
      :live-on="liveOn"
      :is-today="isToday"
      @live="toggleLive"
    />
    <BfReserve
      v-if="data && plan === 'reserve' && part !== 'table'"
      :stations="data.stations"
      :rows="reserveRows"
      :dir="reversed ? -1 : 1"
    />
    <BfCrossings
      v-if="data && plan === 'kreuzung' && part !== 'table'"
      :stations="data.stations"
      :list="crossingList"
      :delay-of="delayOf"
      :hover="hover"
      @hover="hover = $event"
    />
    <BfNode
      v-if="data && plan === 'knoten' && part !== 'table'"
      :stations="data.stations"
      :node="nodeIdx"
      :choices="shownStations.map((st) => st.i)"
      :trains="planTrains"
      :t0="t0"
      :t1="t1"
      :hover="hover"
      @node="setNode"
      @hover="hover = $event"
    />
    <div v-if="data && part !== 'chart'" class="no-print mt-2 flex justify-end gap-1 text-xs">
      <button
        class="btn"
        :class="transposed && 'btn-on'"
        :aria-pressed="transposed"
        v-tip="$t('bf.transposeTip')"
        @click="setQuery({ transpose: transposed ? undefined : '1' })"
      >
        ⤡ {{ $t("bf.transpose") }}
      </button>
      <button v-if="!part" class="btn" v-tip="$t('bf.newWindowTip')" @click="openPart('table')">
        ⧉ {{ $t("bf.tableNewWindow") }}
      </button>
    </div>
    <!-- both directions: Kursbuch layout (a column per train), transposed: a row per train -->
    <template v-if="data && part !== 'chart'">
      <component
        :is="transposed ? BfTable : BfBook"
        v-for="dir in [reversed ? -1 : 1, reversed ? 1 : -1] as const"
        :key="dir"
        :stations="dir === (reversed ? -1 : 1) ? shownStations : [...shownStations].reverse()"
        :trains="[...trainsOnDate, ...hafasOnlyTrains].filter((t) => !hidden.has(t.cat))"
        :dir="dir"
        :t0="t0"
        :t1="t1"
        :date="date"
        :hover="hover"
        :follow="part === 'table'"
        @hover="hover = $event"
      />
    </template>
  </section>
</template>

<style scoped>
/* time grid: hours clearly visible, 30/10 minutes thinner and dashed */
.bf-grid-hour {
  stroke: var(--muted);
  stroke-width: 1;
  opacity: 0.55;
}
.bf-grid-half {
  stroke: var(--muted);
  stroke-width: 0.6;
  stroke-dasharray: 4 3;
  opacity: 0.45;
}
.bf-grid-ten {
  stroke: var(--muted);
  stroke-width: 0.5;
  stroke-dasharray: 1.5 3;
  opacity: 0.4;
}
.bf-single {
  fill: var(--muted);
  opacity: 0.07;
}
.bf-cross {
  stroke: var(--bg2);
  stroke-width: 1;
}
.bf-cross.good {
  fill: var(--good);
}
.bf-cross.mid {
  fill: var(--warn);
}
.bf-cross.bad {
  fill: var(--bad);
}
.bf-tracks line {
  stroke: var(--muted);
  stroke-width: 1.2;
}
.bf-station[href] {
  cursor: pointer;
}
.bf-station[href]:hover text {
  fill: var(--link);
  text-decoration: underline;
}
</style>
