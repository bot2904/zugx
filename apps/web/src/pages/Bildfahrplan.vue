<script setup lang="ts">
// Bildfahrplan (time–distance diagram) for a corridor: x = km, y = time (downwards).
import { addDays, daysBetween, viennaDate, viennaMinutes, viennaNow } from "../lib/format.ts";
import { useDebounceFn, useIntervalFn } from "@vueuse/core";
import type { Corridor, CorridorIndex, CorridorIndexEntry, CorridorTrain } from "@zugx/netz";
import { computed, onMounted, ref, shallowRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import CorridorIndexView from "../components/CorridorIndex.vue";
import { categoryColor } from "../lib/products.ts";
import { trainSlug } from "../lib/url.ts";

type CorridorRef = Pick<CorridorIndexEntry, "id" | "name" | "oebb">;

const files = import.meta.glob<{ default: Corridor }>(
  "../../../../packages/netz/data/corridors/*.json",
);
const indexFile = Object.entries(files).find(([p]) => p.endsWith("/index.json"))?.[1] as
  | (() => Promise<{ default: CorridorIndex }>)
  | undefined;

const { locale } = useI18n();
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
const hover = ref<CorridorTrain>();
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
      .map((p) => /corridors\/([^/]+)\.json$/.exec(p)?.[1])
      .filter((x): x is string => !!x && x !== "index")
      .map((x) => ({ id: x, name: x }));
  }
});

watch(
  id,
  async (c) => {
    if (!c) return;
    const loader = Object.entries(files).find(([p]) => p.endsWith(`/${c}.json`))?.[1];
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

const hourTicks = computed(() => {
  const out: { y: number; label: string; major: boolean }[] = [];
  const step = span.value <= 4 ? 10 : span.value <= 8 ? 30 : 60;
  for (let m = Math.ceil(t0.value / step) * step; m <= t1.value; m += step)
    out.push({
      y: y(m),
      label: `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`,
      major: m % 60 === 0,
    });
  return out;
});

interface Drawn {
  t: CorridorTrain;
  d: string;
  color: string;
  label?: { x: number; y: number };
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
const isToday = computed(() => date.value === today);
const weekday = computed(() =>
  Temporal.PlainDate.from(date.value).toLocaleString(locale.value, { weekday: "short" }),
);

const drawn = computed<Drawn[]>(() => {
  const c = data.value;
  if (!c) return [];
  const out: Drawn[] = [];
  for (const t of trainsOnDate.value) {
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
    out.push({
      t,
      d: path,
      color: categoryColor(t.cat),
      label: mid ? { x: mid[0], y: mid[1] } : undefined,
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

const cats = computed(() => [...new Set(trainsOnDate.value.map((t) => t.cat))]);
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
          :title="$t('bf.prevDay')"
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
          :title="$t('bf.nextDay')"
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
        <button class="btn" @click="setQuery({ from: Math.max(0, Math.floor(from) - 1) })">
          ▲
        </button>
        <span class="mono" :title="$t('bf.wheelHint')">{{ hhmmOf(startMin) }}</span>
        <button class="btn" @click="setQuery({ from: Math.min(23, Math.floor(from) + 1) })">
          ▼
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
      <button class="btn" :title="$t('bf.swap')" :aria-label="$t('bf.swap')" @click="swap">
        ⇄
      </button>
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
    </div>
    <div class="my-2 flex flex-wrap gap-1 text-xs">
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
            @click.prevent="s.hafasId && router.push(`/station/${s.hafasId}`)"
          >
            <title>{{ s.name }}{{ s.hafasId ? ` → ${$t("search.board")}` : "" }}</title>
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
              stroke="var(--line)"
              :stroke-width="tk.major ? 0.8 : 0.3"
            />
            <text
              :x="M.left - 4"
              :y="tk.y + 3"
              text-anchor="end"
              :fill="tk.major ? 'var(--fg)' : 'var(--muted)'"
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
                hover === r.t ? 3 : ['S', 'R', 'REX', 'CJX'].includes(r.t.cat) ? 1 : 1.6
              "
              :opacity="hover && hover !== r.t ? 0.35 : 1"
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
        </g>
      </svg>
    </div>
    <!-- always rendered (nbsp when empty) so hovering doesn't shift the layout -->
    <p class="mono my-1 min-h-[1.4em] text-sm">
      <template v-if="hover">
        {{ hover.cat }} {{ hover.nr }}
        <span v-if="hover.headsign" class="muted">→ {{ hover.headsign }}</span>
      </template>
      <template v-else>&nbsp;</template>
    </p>
  </section>
</template>

<style scoped>
.bf-station[href] {
  cursor: pointer;
}
.bf-station[href]:hover text {
  fill: var(--link);
  text-decoration: underline;
}
</style>
