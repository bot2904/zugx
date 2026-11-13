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

const { t, tm } = useI18n();
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
    if (at.value && x.from[0] !== at.value && x.to[0] !== at.value && !x.via?.includes(at.value))
      return false;
    if (di >= 0 && !runsOnDay(x, di)) return false;
    if (query) {
      if (num) {
        if (num[1] && x.cat.toLowerCase() !== num[1].toLowerCase()) return false;
        return x.nr.startsWith(num[2]!);
      }
      const hay = normalize(
        `${x.cat} ${x.nr} ${x.name ?? ""} ${stationName(x.from[0])} ${stationName(x.to[0])} ${(x.via ?? []).map(stationName).join(" ")}`,
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
  except: (n: number) => `(−${n})`,
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
function strip(x: TrainEntry): string {
  const idx = index.value!;
  const n = totalDays(idx);
  let d = "";
  for (let i = 0; i < n; i++)
    if (runsOnDay(x, i)) d += `M${Math.floor(i / 7) * 2},${(i % 7) * 2}h2v2h-2z`;
  return d;
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
      <button
        v-for="g in quickFilters"
        :key="g"
        class="btn py-0.5 text-xs"
        :class="!cat && quick === g && 'btn-on'"
        @click="setQuick(g)"
      >
        {{ quickLabel(g) }}
      </button>
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
      <input
        v-model="q"
        class="input ml-auto min-w-48 text-sm"
        :placeholder="$t('trains.filter')"
      />
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
        <thead>
          <tr>
            <th>{{ $t("board.line") }}</th>
            <th>{{ $t("trains.route") }}</th>
            <th class="hide-sm">{{ $t("trains.days") }}</th>
            <th class="hide-sm" />
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
              <div v-if="x.op !== 'oebb'" class="muted text-[11px]">{{ x.op }}</div>
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
            <td class="hide-sm whitespace-nowrap text-xs">
              {{ daysSummary(x, index, daysT) }}
              <div class="muted text-[11px]">
                {{ x.first.slice(5) }} – {{ x.last.slice(5)
                }}<template v-if="x.var && x.var > 1">
                  · {{ $t("trains.variants", { n: x.var }) }}</template
                >
              </div>
            </td>
            <td class="hide-sm w-[110px]">
              <svg viewBox="0 0 108 14" width="108" height="14" :aria-label="$t('trains.days')">
                <rect width="108" height="14" fill="var(--bg3)" />
                <path :d="strip(x)" fill="var(--good)" />
              </svg>
            </td>
          </tr>
        </tbody>
      </table>
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
