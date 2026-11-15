<script setup lang="ts">
// Bildfahrplan (time–distance diagram) for a corridor: x = km, y = time (downwards).
import { addDays, daysBetween, viennaDate, viennaMinutes, viennaNow } from "../lib/format.ts";
import {
  useDebounceFn,
  useDocumentVisibility,
  useIntervalFn,
  useSessionStorage,
} from "@vueuse/core";
import type { Corridor, CorridorIndex, CorridorIndexEntry, CorridorTrain } from "@zugx/netz";
import { computed, onMounted, ref, shallowRef, watch } from "vue";
import { useI18n } from "../i18n/index.ts";
import { useRoute, useRouter } from "vue-router";
import CorridorIndexView from "../components/CorridorIndex.vue";
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
const W = 1100;
const H = 760;
const M = { top: 110, right: 20, bottom: 20, left: 46 };
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
const kmLo = computed(() => data.value?.stations[range.value.lo]?.km ?? 0);
const kmHi = computed(() => data.value?.stations[range.value.hi]?.km ?? 1);
const x = (km: number) => {
  const span = Math.max(1, kmHi.value - kmLo.value);
  const rel = reversed.value ? kmHi.value - km : km - kmLo.value;
  return M.left + (rel / span) * (W - M.left - M.right);
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
  M.top + ((min - t0.value) / (t1.value - t0.value)) * (H - M.top - M.bottom);

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
/** window start ± hours (whole hours: from 7.5, one earlier is 7, one later 8) */
function shiftHour(delta: number) {
  const f = from.value;
  const next = delta < 0 ? Math.ceil(f) + delta : Math.floor(f) + delta;
  const max = Math.max(0, 28 - span.value); // trains after midnight run up to ~28:00
  setQuery({ from: Math.min(max, Math.max(0, next)) });
}
// zapping: ←/→ day, ↑/↓ (h/l) hour, Shift+↑/↓ a whole window, n = now
useKeys({
  ArrowLeft: () => id.value && shiftDay(-1),
  ArrowRight: () => id.value && shiftDay(1),
  ArrowUp: (e) => id.value && shiftHour(e.shiftKey ? -span.value : -1),
  ArrowDown: (e) => id.value && shiftHour(e.shiftKey ? span.value : 1),
  h: () => id.value && shiftHour(-1),
  l: () => id.value && shiftHour(1),
  n: () =>
    id.value && setQuery({ d: undefined, from: Math.max(0, Math.floor(viennaMinutes() / 60) - 1) }),
});
const isToday = computed(() => date.value === today);
const weekday = computed(() =>
  Temporal.PlainDate.from(date.value).toLocaleString(locale.value, { weekday: "short" }),
);

// ---- live overlay (?live=1, today only): realtime paths from HAFAS, see lib/bf-live.ts ----
const liveOn = computed(() => route.query.live === "1" && isToday.value);
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
      <span v-if="data" class="flex items-center gap-1 text-xs">
        <button
          class="btn"
          v-tip="`${$t('bf.prevDay')} (←)`"
          :aria-label="$t('bf.prevDay')"
          @click="shiftDay(-1)"
        >
          ‹
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
        <span class="mono muted">{{ weekday }}</span>
        <button
          class="btn"
          v-tip="`${$t('bf.nextDay')} (→)`"
          :aria-label="$t('bf.nextDay')"
          @click="shiftDay(1)"
        >
          ›
        </button>
        <button v-if="!isToday" class="btn" @click="setQuery({ d: undefined })">
          {{ $t("trains.today") }}
        </button>
        <span class="muted">{{ $t("bf.trainsOnDay", { n: trainsOnDate.length }) }}</span>
        <span
          v-if="data.begin && (date < data.begin || date > data.end)"
          class="text-[var(--warn)]"
        >
          {{ $t("bf.outside", { begin: data.begin, end: data.end }) }}
        </span>
      </span>
      <span class="ml-auto flex items-center gap-1 text-xs">
        <button class="btn" v-tip="`${$t('bf.hourEarlier')} (↑)`" @click="shiftHour(-1)">▲</button>
        <span class="mono" v-tip="$t('bf.wheelHint')">{{ hhmmOf(startMin) }}</span>
        <button class="btn" v-tip="`${$t('bf.hourLater')} (↓)`" @click="shiftHour(1)">▼</button>
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
    </div>
    <div v-if="data" class="my-2 flex flex-wrap items-center gap-1 text-xs">
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
    <div v-if="data" class="card overflow-x-auto p-1">
      <svg
        :viewBox="`0 0 ${W} ${H}`"
        class="block w-full min-w-[800px]"
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
            :stroke="s.major ? 'var(--muted)' : 'var(--line)'"
            :stroke-width="s.major ? 1 : 0.6"
          />
          <!-- station name → live departure board -->
          <a
            :href="s.hafasId ? `/station/${s.hafasId}` : undefined"
            class="bf-station"
            @click="openStation(s.hafasId, $event)"
            v-tip="s.hafasId ? { title: s.name, lines: [`${$t('search.board')} →`] } : s.name"
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
.bf-station[href] {
  cursor: pointer;
}
.bf-station[href]:hover text {
  fill: var(--link);
  text-decoration: underline;
}
</style>
