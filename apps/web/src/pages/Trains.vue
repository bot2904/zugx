<script setup lang="ts">
// Train index ("Zugindex"), vagonweb-style: every train running in Austria in a timetable year.
import { computed, onMounted, ref, shallowRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import LineBadge from "../components/LineBadge.vue";
import Status from "../components/Status.vue";
import { useKeys } from "../lib/keys.ts";
import { normalize } from "../lib/normalize.ts";
import {
  catRank,
  dayIndex,
  dayIso,
  daysSummary,
  daysTooltip,
  type DaysTooltipLabels,
  inGroup,
  loadTrains,
  needsFull,
  runsOnDay,
  totalDays,
  yearFor,
  years,
  type QuickFilter,
  type TrainEntry,
  type TrainIndex,
} from "../lib/trains.ts";
import { trainSlug } from "../lib/url.ts";

const { t, tm, locale } = useI18n();
const route = useRoute();
const router = useRouter();

const todayIso = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Vienna" });
const year = computed(() => Number(route.query.y) || yearFor(todayIso) || years[0] || 0);
const quick = computed<QuickFilter>(() => {
  const q = route.query.g;
  return q === "all" || q === "regional" || q === "suburban" || q === "night" ? q : "long";
});
const op = computed(() =>
  route.params.op && route.params.op !== "all" ? String(route.params.op) : "",
);
const cat = computed(() => (route.params.cat ? String(route.params.cat).toUpperCase() : ""));
const day = computed(() => (typeof route.query.d === "string" ? route.query.d : ""));
const at = computed(() => (typeof route.query.at === "string" ? route.query.at : ""));
const q = ref(typeof route.query.q === "string" ? route.query.q : "");

const index = shallowRef<TrainIndex>();
const loading = ref(false);
const isFull = ref(false);
const limit = ref(300);
const sel = ref(-1);

/** full file needed: quick filter, regional category, station filter, or ?all */
const wantFull = computed(
  () =>
    needsFull(quick.value) ||
    route.query.all !== undefined ||
    !!at.value ||
    (!!cat.value && !inGroup(cat.value, "long")),
);

async function load() {
  if (!year.value) return;
  const full = wantFull.value || isFull.value;
  if (index.value && index.value.year === year.value && isFull.value === full) return;
  loading.value = true;
  try {
    index.value = await loadTrains(year.value, full);
    isFull.value = full && !!index.value;
    if (!index.value && full) index.value = await loadTrains(year.value, false);
  } finally {
    loading.value = false;
  }
}
onMounted(load);
watch([year, wantFull], load);

function setQuery(patch: Record<string, string | undefined>) {
  const next: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...route.query, ...patch }))
    if (typeof v === "string") next[k] = v;
  void router.replace({ query: next });
}
let qTimer: ReturnType<typeof setTimeout> | undefined;
watch(q, (v) => {
  clearTimeout(qTimer);
  qTimer = setTimeout(() => setQuery({ q: v || undefined }), 250);
  limit.value = 300;
});

const stationName = (id: string) => index.value?.stations[id] ?? id;

const operators = computed(() => [...new Set(index.value?.trains.map((x) => x.op) ?? [])].sort());
const categories = computed(() =>
  [
    ...new Set(
      index.value?.trains.filter((x) => !op.value || x.op === op.value).map((x) => x.cat) ?? [],
    ),
  ].sort((a, b) => catRank(a) - catRank(b) || a.localeCompare(b)),
);

const TRAIN_RE = /^([a-z]{1,4})?\s*(\d{1,6})$/i;

const filtered = computed<TrainEntry[]>(() => {
  const idx = index.value;
  if (!idx) return [];
  const query = normalize(q.value);
  const num = TRAIN_RE.exec(q.value.trim());
  const di = day.value ? dayIndex(idx.begin, day.value) : -1;
  return idx.trains.filter((x) => {
    if (op.value && x.op !== op.value) return false;
    if (cat.value && x.cat !== cat.value) return false;
    if (!cat.value && !inGroup(x.cat, quick.value)) return false;
    if (at.value && x.from[0] !== at.value && x.to[0] !== at.value && !x.stops.includes(at.value))
      return false;
    if (di >= 0 && !runsOnDay(x, di)) return false;
    if (query) {
      if (num) {
        if (num[1] && x.cat.toLowerCase() !== num[1].toLowerCase()) return false;
        return x.nr.startsWith(num[2]!);
      }
      const hay = normalize(
        `${x.cat} ${x.nr} ${x.name ?? ""} ${stationName(x.from[0])} ${stationName(x.to[0])} ${x.stops.map(stationName).join(" ")}`,
      );
      return query.split(" ").every((tok) => hay.includes(tok));
    }
    return true;
  });
});

const sorted = computed(() =>
  [...filtered.value].sort(
    (a, b) =>
      catRank(a.cat) - catRank(b.cat) || a.cat.localeCompare(b.cat) || Number(a.nr) - Number(b.nr),
  ),
);
const shown = computed(() => sorted.value.slice(0, limit.value));

const daysT = computed(() => ({
  weekdays: tm("weekdays") as string[],
  daily: t("trains.daily"),
}));
const tipT = computed<DaysTooltipLabels>(() => ({
  ...daysT.value,
  runs: (pattern) => t("trains.tip.runs", { pattern }),
  irregular: t("trains.tip.irregular"),
  period: (n, from, to) => t("trains.tip.period", { n, from, to }),
  except: (list) => t("trains.tip.except", { list }),
  extra: (list) => t("trains.tip.extra", { list }),
  variants: (n) => t("trains.variants", { n }),
}));

/** next running day ≥ today, for the live train link */
function nextRun(x: TrainEntry): string | undefined {
  const idx = index.value;
  if (!idx) return undefined;
  const start = Math.max(0, dayIndex(idx.begin, day.value || todayIso));
  for (let i = start; i < totalDays(idx); i++) if (runsOnDay(x, i)) return dayIso(idx.begin, i);
  return undefined;
}

function trainLink(x: TrainEntry) {
  const d = nextRun(x);
  return { path: `/train/${trainSlug(`${x.cat} ${x.nr}`)}`, query: d ? { d } : {} };
}

/** 53 weeks × 7 days mini heat strip */
// year strip: one column per week (Mon–Sun top to bottom), timetable year left to right
const beginWd = computed(() =>
  index.value ? (new Date(`${index.value.begin}T00:00:00Z`).getUTCDay() + 6) % 7 : 0,
);
const cell = (i: number) => {
  const p = i + beginWd.value;
  return { x: Math.floor(p / 7) * 2, y: (p % 7) * 2 };
};

function strip(x: TrainEntry): string {
  const idx = index.value!;
  const n = totalDays(idx);
  let d = "";
  for (let i = 0; i < n; i++)
    if (runsOnDay(x, i)) {
      const c = cell(i);
      d += `M${c.x},${c.y}h2v2h-2z`;
    }
  return d;
}

/** tick at the first day of each month (below the strip) */
const monthTicks = computed(() => {
  const idx = index.value;
  if (!idx) return "";
  let d = "";
  for (let i = 0; i < totalDays(idx); i++)
    if (dayIso(idx.begin, i).endsWith("-01")) d += `M${cell(i).x},14v2`;
  return d;
});

const tip = ref<{ text: string; x: number; y: number }>();
const dayFmt = computed(
  () =>
    new Intl.DateTimeFormat(locale.value, {
      weekday: "short",
      day: "numeric",
      month: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }),
);
function stripMove(ev: MouseEvent, x: TrainEntry) {
  const idx = index.value;
  if (!idx) return;
  const r = (ev.currentTarget as SVGElement).getBoundingClientRect();
  const col = Math.floor(((ev.clientX - r.left) / r.width) * 54);
  const row = Math.floor(((ev.clientY - r.top) / r.height) * 8);
  const i = col * 7 + row - beginWd.value;
  if (row > 6 || i < 0 || i >= totalDays(idx)) {
    tip.value = undefined;
    return;
  }
  const date = dayFmt.value.format(new Date(`${dayIso(idx.begin, i)}T00:00:00Z`));
  const runs = runsOnDay(x, i);
  tip.value = {
    text: `${date} · ${runs ? t("trains.tip.runsOn") : t("trains.tip.notOn")}`,
    x: ev.clientX,
    y: ev.clientY,
  };
}

function goFilter(o: string, c: string) {
  const path = c ? `/trains/${o || "all"}/${c.toLowerCase()}` : o ? `/trains/${o}` : "/trains";
  void router.push({ path, query: route.query });
}

function setQuick(g: QuickFilter) {
  const query = { ...route.query, g: g === "long" ? undefined : g };
  void router.push({ path: op.value ? `/trains/${op.value}` : "/trains", query });
}

const quickFilters: QuickFilter[] = ["long", "regional", "suburban", "night", "all"];
const quickLabel = (g: QuickFilter) =>
  ({
    all: t("trains.all"),
    long: t("trains.longDistance"),
    regional: t("trains.regional"),
    suburban: t("trains.suburban"),
    night: t("trains.night"),
  })[g];

useKeys({
  j: () => (sel.value = Math.min(shown.value.length - 1, sel.value + 1)),
  k: () => (sel.value = Math.max(0, sel.value - 1)),
  Enter: () => {
    const x = shown.value[sel.value];
    if (x) void router.push(trainLink(x));
  },
});
watch(sel, (i) =>
  document.querySelector(`[data-row="${i}"]`)?.scrollIntoView({ block: "nearest" }),
);
</script>

<template>
  <section>
    <div class="flex flex-wrap items-baseline gap-2">
      <h1 class="m-0 text-xl">{{ $t("trains.title") }}</h1>
      <span class="muted text-sm">{{ $t("trains.subtitle", { year }) }}</span>
      <select
        v-if="years.length > 1"
        class="input ml-auto text-xs"
        :value="year"
        @change="setQuery({ y: ($event.target as HTMLSelectElement).value })"
      >
        <option v-for="y in years" :key="y" :value="y">{{ y }}</option>
      </select>
    </div>

    <div class="my-2 flex flex-wrap items-center gap-1 text-xs">
      <span class="chips flex flex-wrap gap-1">
        <button
          v-for="g in quickFilters"
          :key="g"
          class="btn chip py-0.5 text-xs"
          :class="!cat && quick === g && 'btn-on'"
          @click="setQuick(g)"
        >
          {{ quickLabel(g) }}
        </button>
      </span>
      <select
        class="input ml-2 text-xs"
        :value="op"
        :aria-label="$t('trains.operator')"
        @change="goFilter(($event.target as HTMLSelectElement).value, '')"
      >
        <option value="">{{ $t("trains.operator") }}: *</option>
        <option v-for="o in operators" :key="o" :value="o">{{ o }}</option>
      </select>
      <select
        class="input text-xs"
        :value="cat"
        :aria-label="$t('trains.category')"
        @change="goFilter(op, ($event.target as HTMLSelectElement).value)"
      >
        <option value="">{{ $t("trains.category") }}: *</option>
        <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
      </select>
      <label class="ml-2 flex items-center gap-1">
        {{ $t("trains.runsOn") }}
        <input
          type="date"
          class="input text-xs"
          :value="day"
          @change="setQuery({ d: ($event.target as HTMLInputElement).value || undefined })"
        />
      </label>
      <button
        class="btn py-0.5 text-xs"
        :class="day === todayIso && 'btn-on'"
        @click="setQuery({ d: day === todayIso ? undefined : todayIso })"
      >
        {{ $t("trains.today") }}
      </button>
      <search class="contents">
        <input
          v-model="q"
          type="search"
          enterkeyhint="search"
          class="input ml-auto min-w-48 text-sm"
          :placeholder="$t('trains.filter')"
          :aria-label="$t('trains.filter')"
        />
      </search>
    </div>

    <p v-if="at" class="text-sm">
      @ {{ stationName(at) }}
      <button class="btn py-0 text-xs" @click="setQuery({ at: undefined })">✕</button>
    </p>

    <Status :loading="loading" />
    <p v-if="loading && wantFull" class="muted text-xs">{{ $t("trains.loadingFull") }}</p>
    <p v-if="!loading && !index" class="muted">{{ $t("trains.noData") }}</p>

    <template v-if="index">
      <p class="muted my-1 text-xs">
        {{ $t("trains.count", { shown: filtered.length, total: index.trains.length }) }} ·
        {{ index.begin }} – {{ index.end }} · {{ index.source }}
        <template v-if="!isFull">
          ·
          <a href="#" @click.prevent="setQuery({ all: '' })"
            >+ {{ $t("trains.regional") }}/{{ $t("trains.suburban") }}</a
          ></template
        >
      </p>
      <table class="dense">
        <caption class="sr-only">
          {{ $t("trains.title") }}
        </caption>
        <thead>
          <tr>
            <th>{{ $t("board.line") }}</th>
            <th>{{ $t("trains.route") }}</th>
            <th class="hide-sm cursor-help" :title="$t('trains.tip.column')">
              {{ $t("trains.days") }} ⓘ
            </th>
            <th class="hide-sm cursor-help" :title="$t('trains.tip.strip')">
              {{ index.begin.slice(0, 7) }} → {{ index.end.slice(0, 7) }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(x, i) in shown"
            :key="x.op + x.cat + x.nr"
            :data-row="i"
            :class="i === sel && 'sel'"
          >
            <td class="whitespace-nowrap">
              <RouterLink :to="trainLink(x)" class="no-underline"
                ><LineBadge :cat="x.cat" :nr="x.nr"
              /></RouterLink>
              <div v-if="x.name" class="text-xs italic">»{{ x.name }}«</div>
              <div v-if="x.op !== 'oebb'" class="muted text-[0.6875rem]">{{ x.op }}</div>
            </td>
            <td>
              <span class="mono muted mr-1"
                >{{ x.from[1] }}{{ x.from[2] ? `+${x.from[2]}` : "" }}</span
              >
              <a href="#" class="text-[var(--fg)]" @click.prevent="setQuery({ at: x.from[0] })">{{
                stationName(x.from[0])
              }}</a>
              <span class="muted"> → </span>
              <a href="#" class="text-[var(--fg)]" @click.prevent="setQuery({ at: x.to[0] })">{{
                stationName(x.to[0])
              }}</a>
              <span class="mono muted ml-1">{{ x.to[1] }}{{ x.to[2] ? `+${x.to[2]}` : "" }}</span>
              <div v-if="x.via?.length" class="muted text-xs">
                <template v-for="(v, k) in x.via" :key="v">
                  <span v-if="k"> · </span
                  ><a href="#" class="muted" @click.prevent="setQuery({ at: v })">{{
                    stationName(v)
                  }}</a>
                </template>
              </div>
            </td>
            <td
              class="hide-sm cursor-help whitespace-nowrap text-xs"
              :title="daysTooltip(x, index, locale, tipT)"
            >
              {{ daysSummary(x, index, daysT) }}
              <div class="muted text-[0.6875rem]">
                {{ x.first.slice(5) }} – {{ x.last.slice(5)
                }}<template v-if="x.var && x.var > 1">
                  · {{ $t("trains.variants", { n: x.var }) }}</template
                >
              </div>
            </td>
            <td class="hide-sm w-[110px]">
              <svg
                viewBox="0 0 108 16"
                width="108"
                height="16"
                class="cursor-crosshair"
                :aria-label="daysTooltip(x, index, locale, tipT)"
                @mousemove="stripMove($event, x)"
                @mouseleave="tip = undefined"
              >
                <rect width="108" height="14" fill="var(--bg3)" />
                <path :d="strip(x)" fill="var(--good)" />
                <path :d="monthTicks" stroke="var(--muted)" stroke-width="0.6" />
              </svg>
            </td>
          </tr>
        </tbody>
      </table>
      <div
        v-if="tip"
        class="card mono pointer-events-none fixed z-50 px-2 py-0.5 text-xs shadow"
        :style="{ left: `${tip.x + 12}px`, top: `${tip.y + 12}px` }"
      >
        {{ tip.text }}
      </div>
      <button
        v-if="filtered.length > limit"
        class="btn mt-2 w-full justify-center"
        @click="limit += 500"
      >
        +{{ Math.min(500, filtered.length - limit) }} ({{ filtered.length - limit }})
      </button>
    </template>
  </section>
</template>
