<script setup lang="ts">
// Departure poster ("Abfahrt", like the printed timetables in the stations): every train leaving
// the station on the chosen day, from the open data GTFS (timetable, not live) — grouped by hour in
// newspaper columns, with following stops and platform. Data: packages/trains/data/departures
// (one file per station, loaded on demand; built by `vp run departures:build`).
import { computed, shallowRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "../i18n/index.ts";
import { addDays, daysBetween, viennaDate } from "../lib/format.ts";
import { categoryColor } from "../lib/products.ts";
import { trainSlug } from "../lib/url.ts";
import { useKeys } from "../lib/keys.ts";
import { usePageTitle } from "../lib/title.ts";
import { loadStations, stationById } from "../lib/stations.ts";

/** [minutes after midnight of the service day, category, number, destination id, following stop ids, days index, platform] */
type Row = [number, string, string, string, string[], number, string];
interface Departures {
  id: string;
  name: string;
  begin: string;
  end: string;
  source: string;
  days: string[];
  deps: Row[];
  names: Record<string, string>;
}

const files = import.meta.glob<{ default: Departures }>(
  "../../../../packages/trains/data/departures/*.toml",
);
const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const id = computed(() => String(route.params.id));
const data = shallowRef<Departures>();
const missing = shallowRef(false);
watch(
  id,
  async (sid) => {
    const load = Object.entries(files).find(([p]) => p.endsWith(`/${sid}.toml`))?.[1];
    missing.value = !load;
    data.value = load ? (await load()).default : undefined;
  },
  { immediate: true },
);

// ---- date (like the Bildfahrplan: ?d=, ←/→, today) ----
const today = viennaDate();
const date = computed(() => {
  const q = typeof route.query.d === "string" ? route.query.d : "";
  if (/^\d{4}-\d\d-\d\d$/.test(q)) return q;
  const d = data.value;
  return d && (today < d.begin || today > d.end) ? d.begin : today;
});
const setDate = (d: string | undefined) =>
  void router.replace({ query: { ...route.query, d: d === today ? undefined : d } });
useKeys({
  ArrowLeft: () => setDate(addDays(date.value, -1)),
  ArrowRight: () => setDate(addDays(date.value, 1)),
});
const weekday = computed(() =>
  Temporal.PlainDate.from(date.value).toLocaleString(locale.value, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }),
);

// ---- the day's departures ----
const bits = computed(() =>
  (data.value?.days ?? []).map((b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))),
);
const runs = (di: number, i: number) =>
  ((bits.value[di]?.[i >> 3] ?? 0) >> (7 - (i & 7))) % 2 === 1;
// names as in the search (station index), else the timetable's, without "Bahnhof"/"Bahnhst"
const stationsReady = shallowRef(false);
void loadStations().then(() => (stationsReady.value = true));
const name = (sid: string) => {
  void stationsReady.value;
  const n =
    stationById(sid)?.name ??
    data.value?.names[sid] ??
    (sid === data.value?.id ? data.value.name : sid);
  return n.replace(/\s+(Bahnhof|Bahnhst|Bhf)$/, "");
};
const hours = computed(() => {
  const d = data.value;
  if (!d) return [];
  const i = daysBetween(d.begin, date.value);
  if (i < 0) return [];
  const byHour = new Map<number, Row[]>();
  for (const r of d.deps) {
    if (!runs(r[5], i)) continue;
    const h = Math.floor(r[0] / 60);
    byHour.set(h, [...(byHour.get(h) ?? []), r]);
  }
  return [...byHour].sort((a, b) => a[0] - b[0]);
});
const count = computed(() => hours.value.reduce((n, [, rs]) => n + rs.length, 0));
const hh = (h: number) => `${h % 24}`;
const mm = (m: number) => String(m % 60).padStart(2, "0");

const doPrint = () => window.print();
usePageTitle(() => [t("poster.title"), data.value ? name(data.value.id) : undefined]);
</script>

<template>
  <section class="poster-page">
    <div class="no-print mb-2 flex flex-wrap items-center gap-2 text-xs">
      <RouterLink :to="`/station/${id}`" class="btn">← {{ $t("poster.live") }}</RouterLink>
      <button class="btn" :aria-label="$t('bf.prevDay')" @click="setDate(addDays(date, -1))">
        ←
      </button>
      <input
        type="date"
        class="input text-xs"
        :value="date"
        :min="data?.begin"
        :max="data?.end"
        :aria-label="$t('trains.runsOn')"
        @change="setDate(($event.target as HTMLInputElement).value || undefined)"
      />
      <button class="btn" :aria-label="$t('bf.nextDay')" @click="setDate(addDays(date, 1))">
        →
      </button>
      <button v-if="date !== today" class="btn" @click="setDate(undefined)">
        {{ $t("trains.today") }}
      </button>
      <span class="muted">{{ $t("poster.count", { n: count }) }}</span>
      <button class="btn ml-auto" @click="doPrint">⎙ {{ $t("poster.print") }}</button>
    </div>

    <p v-if="missing" class="muted">{{ $t("poster.noData") }}</p>
    <article v-else-if="data" class="poster">
      <header class="poster-head">
        <svg viewBox="0 0 48 48" class="icon" aria-hidden="true">
          <rect
            x="2"
            y="2"
            width="44"
            height="44"
            rx="4"
            fill="none"
            stroke="currentColor"
            stroke-width="3"
          />
          <rect x="11" y="10" width="26" height="20" rx="3" fill="currentColor" />
          <rect x="14" y="13" width="20" height="7" fill="#000" opacity="0.9" />
          <circle cx="16" cy="35" r="3.5" fill="currentColor" />
          <circle cx="32" cy="35" r="3.5" fill="currentColor" />
        </svg>
        <span class="big">{{ $t("poster.departure") }}</span>
        <span class="langs">Departure · Partenza · Départ</span>
      </header>
      <div class="poster-body">
        <h1 class="station">{{ name(data.id) }}</h1>
        <p class="date">{{ weekday }}</p>
        <p v-if="!count" class="muted">{{ $t("poster.none") }}</p>
        <div class="cols">
          <section v-for="[h, rows] in hours" :key="h" class="hour">
            <h2 class="hour-head">
              <span>{{ hh(h) }}<span class="min">00</span></span>
              <span class="plat-head">{{ $t("poster.platform") }}</span>
            </h2>
            <div v-for="(r, k) in rows" :key="k" class="dep">
              <span class="time mono">{{ hh(h) }}<span class="min">{{ mm(r[0]) }}</span></span>
              <RouterLink
                class="train"
                :to="{ path: `/train/${trainSlug(`${r[1]} ${r[2]}`)}`, query: { d: date } }"
                :style="{ color: categoryColor(r[1]) }"
                ><span class="cat">{{ r[1] }}</span>
                <span class="nr">{{ r[2] }}</span></RouterLink
              >
              <span class="dest">
                <strong>{{ name(r[3]) }}</strong
                ><span v-if="r[4].length" class="via">{{
                  ` ${$t("poster.via")} ${r[4].map(name).join(" – ")}`
                }}</span>
              </span>
              <span class="plat mono">{{ r[6] }}</span>
            </div>
          </section>
        </div>
        <footer class="poster-foot">
          {{ $t("poster.source", { begin: data.begin, end: data.end, source: data.source }) }}
        </footer>
      </div>
    </article>
  </section>
</template>

<style scoped>
.poster {
  --ink: #111;
  --paper: #ffe14d;
  color: var(--ink);
  background: var(--paper);
  border-radius: 0.375rem;
  overflow: hidden;
  font-family: "Helvetica Neue", Arial, system-ui, sans-serif;
}
.poster a {
  color: inherit;
}
.poster-head {
  display: flex;
  align-items: baseline;
  gap: 1rem;
  padding: 0.75rem 1.25rem;
  background: #000;
  color: #fff;
}
.poster-head .icon {
  width: 2.75rem;
  height: 2.75rem;
  align-self: center;
}
.poster-head .big {
  font-size: 2.5rem;
  font-weight: 800;
  line-height: 1;
}
.poster-head .langs {
  font-size: 1.1rem;
  font-weight: 700;
}
.poster-body {
  padding: 0.75rem 1.25rem 1rem;
}
.station {
  margin: 0;
  font-size: 2.25rem;
  font-weight: 800;
}
.date {
  margin: 0 0 1rem;
  font-weight: 700;
}
/* newspaper columns: hours flow from column to column */
.cols {
  column-width: 22rem;
  column-gap: 1.5rem;
}
.hour {
  break-inside: avoid-column;
  margin-bottom: 0.75rem;
}
.hour-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin: 0;
  padding-bottom: 0.125rem;
  border-bottom: 3px solid var(--ink);
  font-size: 1.5rem;
  font-weight: 800;
}
.hour-head .min {
  margin-left: 0.25em;
}
.plat-head {
  font-size: 0.7rem;
  font-weight: 700;
}
.dep {
  display: grid;
  grid-template-columns: 2.6rem 4.6rem 1fr 2rem;
  gap: 0 0.375rem;
  padding: 0.125rem 0;
  border-bottom: 1px solid color-mix(in srgb, var(--ink) 35%, transparent);
  font-size: 0.8rem;
  line-height: 1.15;
  break-inside: avoid;
}
.time {
  text-align: right;
}
.time .min {
  margin-left: 0.2em;
  font-weight: 700;
}
.train {
  font-weight: 800;
  white-space: nowrap;
  text-decoration: none;
}
.train .cat {
  font-style: italic;
}
.train .nr {
  font-size: 0.7rem;
  font-weight: 600;
}
.train:hover {
  text-decoration: underline;
}
.dest strong {
  font-weight: 800;
}
.via {
  font-weight: 400;
}
.plat {
  text-align: right;
  font-weight: 700;
}
.poster-foot {
  margin-top: 1rem;
  font-size: 0.7rem;
}
@media print {
  .poster {
    border-radius: 0;
  }
}
</style>
