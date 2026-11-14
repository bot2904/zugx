<script setup lang="ts">
// Live train positions (HAFAS JourneyGeoPos) for the visible map area.
import { useAutoRefresh } from "../lib/refresh.ts";
import type { Line, Movement, Trip } from "@zugx/hafas";
import type { Map as MlMap } from "maplibre-gl";
import { useDebounceFn, useLocalStorage } from "@vueuse/core";
import { computed, ref, shallowRef, watch } from "vue";
import { useI18n } from "../i18n/index.ts";
import { useRoute, useRouter } from "vue-router";
import LineBadge from "../components/LineBadge.vue";
import Remarks from "../components/Remarks.vue";
import TripStops from "../components/TripStops.vue";
import { useKeys } from "../lib/keys.ts";
import Status from "../components/Status.vue";
import { api } from "../lib/api.ts";
import { lineColor, PRODUCT_GROUPS, RAIL_CLS } from "../lib/products.ts";
import {
  classColor,
  DELAY_CLASSES,
  delayClass,
  delayColor,
  fmtSignedDelay,
  delayPalette,
  NO_DATA,
} from "../lib/delay.ts";
import MapView, { type MapLine, type MapPoint } from "../viz/MapView.vue";

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const movements = shallowRef<Movement[]>([]);
const error = ref<string>();
const loading = ref(false);
const products = ref(RAIL_CLS);
let map: MlMap | undefined;

async function refresh(background = false) {
  if (!map) return;
  const b = map.getBounds();
  loading.value = true;
  try {
    movements.value = await api(background).radar(
      { north: b.getNorth(), south: b.getSouth(), west: b.getWest(), east: b.getEast() },
      { results: 1000, products: products.value },
    );
    error.value = undefined;
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

function onReady(m: MlMap) {
  map = m;
  void refresh();
}
const onMove = useDebounceFn(() => void refresh(), 400);
useAutoRefresh(() => void refresh(true), 15_000);

// ---- selected train: its run in a side panel on the radar (like vonatinfo), ?trip=<journey id>.
// Opening pushes a history entry, so "back" closes the panel.
const selectedId = computed(() =>
  typeof route.query.trip === "string" ? route.query.trip : undefined,
);
const selected = shallowRef<Trip>();
const selError = ref<string>();
const now = ref(Date.now());
async function loadSelected(background = false) {
  const jid = selectedId.value;
  if (!jid) {
    selected.value = undefined;
    return;
  }
  selError.value = undefined;
  try {
    const trip = await api(background).trip(jid, true);
    if (selectedId.value === jid) selected.value = trip;
  } catch (e) {
    selError.value = e instanceof Error ? e.message : String(e);
  }
}
watch(
  selectedId,
  (jid, old) => {
    if (jid !== old) selected.value = undefined;
    void loadSelected();
  },
  { immediate: true },
);
useAutoRefresh(() => {
  now.value = Date.now();
  if (selectedId.value) void loadSelected(true);
}, 30_000);
const select = (jid: string) => void router.push({ query: { ...route.query, trip: jid } });
const closePanel = () => {
  const { trip: _, ...q } = route.query;
  void router.replace({ query: q });
};
useKeys({ Escape: () => selectedId.value && closePanel() });
const selectedMovement = computed(() =>
  movements.value.find((m) => m.journeyId === selectedId.value),
);
/** the selected train's route on the map (polyline, else the stops) */
const routeLines = computed<MapLine[]>(() => {
  const tr = selected.value;
  if (!tr) return [];
  const coords =
    tr.polyline ??
    tr.stopovers
      .filter((s) => s.stop.lat)
      .map((s) => [s.stop.lat!, s.stop.lon!] as [number, number]);
  return [{ coords, color: lineColor(tr.line) }];
});

// colour by delay (scale like MÁV's vonatinfo) or by train category
const mode = useLocalStorage<"delay" | "category">("zugx:radar-mode", "delay");

const counts = computed(() => {
  const c: Record<string, number> = {
    nodata: 0,
    ontime: 0,
    minor: 0,
    slight: 0,
    late: 0,
    verylate: 0,
  };
  for (const m of movements.value) {
    const cls = delayClass(m.delay);
    c[cls]!++;
  }
  return c;
});

/** "RJX 162", "S 2 (22734)" — always show the train number */
const trainLabel = (l: Line) => (l.trainNumber ? `${l.name} (${l.trainNumber})` : l.name);
/** " · +7′", " · −2′" (early), " · ±0′", or " · no realtime data" */
/** category legend: categories in view, most frequent first (max. 10) */
const catCounts = computed(() => {
  const m = new Map<string, { cat: string; n: number; color: string }>();
  for (const mv of movements.value) {
    const cat = mv.line.category.toUpperCase() || "?";
    const e = m.get(cat) ?? { cat, n: 0, color: lineColor(mv.line) };
    e.n++;
    m.set(cat, e);
  }
  return [...m.values()].sort((a, b) => b.n - a.n).slice(0, 10);
});

const fmtDelay = (d?: number) =>
  ` · ${d === undefined ? t("radar.delay.nodata") : d > 0 ? `+${d}′` : d < 0 ? `−${-d}′` : "±0′"}`;

const points = computed<MapPoint[]>(() =>
  movements.value.map((m) => ({
    lat: m.lat,
    lon: m.lon,
    id: m.journeyId,
    color: mode.value === "delay" ? delayColor(m.delay) : lineColor(m.line),
    label: `${trainLabel(m.line)} → ${m.direction}${fmtDelay(m.delay)}`,
    bearing: m.bearing,
    big: m.journeyId === selectedId.value,
  })),
);

function toggle(cls: number) {
  products.value = products.value ^ cls || RAIL_CLS;
  void refresh();
}
</script>

<template>
  <section>
    <div class="mb-2 flex flex-wrap items-center gap-2">
      <h1 class="m-0 text-xl">{{ $t("radar.title") }}</h1>
      <span class="muted text-sm">{{ $t("radar.trains", { n: movements.length }) }}</span>
      <span v-if="loading" class="muted animate-pulse text-xs">●</span>
      <span
        class="flex items-center gap-1 text-xs"
        role="radiogroup"
        :aria-label="$t('radar.colour')"
      >
        <span class="muted">{{ $t("radar.colour") }}:</span>
        <button
          class="btn chip py-0.5 text-xs"
          role="radio"
          :aria-checked="mode === 'delay'"
          :class="mode === 'delay' && 'btn-on'"
          @click="mode = 'delay'"
        >
          {{ $t("radar.byDelay") }}
        </button>
        <button
          class="btn chip py-0.5 text-xs"
          role="radio"
          :aria-checked="mode === 'category'"
          :class="mode === 'category' && 'btn-on'"
          @click="mode = 'category'"
        >
          {{ $t("radar.byCategory") }}
        </button>
      </span>
      <span class="ml-auto flex flex-wrap gap-1">
        <span class="chips flex flex-wrap gap-1">
          <button
            v-for="g in PRODUCT_GROUPS.slice(0, 7)"
            :key="g.id"
            class="btn chip py-0.5 text-xs"
            :class="products & g.cls ? 'btn-on' : 'muted line-through'"
            @click="toggle(g.cls)"
          >
            {{ $t(`products.${g.id}`) }}
          </button>
        </span>
      </span>
    </div>
    <Status :error="error" @retry="refresh" />
    <div class="relative">
      <div
        v-if="loading && !movements.length"
        class="card absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2 px-4 py-2 text-sm shadow"
        role="status"
      >
        <span class="inline-block animate-spin">⟳</span> {{ $t("radar.loading") }}
      </div>
      <MapView
        :points="points"
        :lines="routeLines"
        :fit="false"
        height="calc(100vh - 170px)"
        @ready="onReady"
        @moveend="onMove"
        @click-point="select"
      />
      <!-- train run of the clicked train: side panel (desktop) / bottom sheet (phones) -->
      <aside
        v-if="selectedId"
        class="card radar-panel absolute z-20 flex flex-col overflow-hidden shadow-xl"
        :aria-label="$t('trip.title')"
      >
        <header class="flex items-start gap-2 border-b border-[var(--line)] p-2">
          <div v-if="selected" class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-1.5">
              <LineBadge :line="selected.line" />
              <span v-if="selected.line.trainNumber" class="mono muted text-xs">{{
                selected.line.trainNumber
              }}</span>
              <strong class="truncate text-sm">→ {{ selected.direction }}</strong>
            </div>
            <div class="mt-1 flex flex-wrap items-center gap-2 text-xs">
              <span
                v-if="selectedMovement?.delay !== undefined"
                class="rounded px-1.5 py-0.5 font-semibold text-black"
                :style="{ background: delayColor(selectedMovement.delay) }"
                >{{ fmtSignedDelay(selectedMovement.delay) }}</span
              >
              <RouterLink :to="`/train/${encodeURIComponent(selectedId)}`"
                >{{ $t("radar.openTrip") }} →</RouterLink
              >
            </div>
          </div>
          <span v-else class="muted flex-1 text-sm" role="status">{{ $t("common.loading") }}</span>
          <button
            class="btn px-2 py-0.5"
            :aria-label="$t('common.close')"
            :title="`${$t('common.close')} (Esc)`"
            @click="closePanel"
          >
            ✕
          </button>
        </header>
        <div class="overflow-y-auto p-2">
          <Status :error="selError" @retry="loadSelected" />
          <template v-if="selected">
            <TripStops :trip="selected" :now="now" />
            <Remarks :remarks="selected.remarks" class="mt-3" />
          </template>
        </div>
      </aside>
      <div
        class="card absolute bottom-8 left-2 z-10 p-2 text-xs shadow"
        role="group"
        :aria-label="$t('radar.legend')"
      >
        <ul v-if="mode === 'delay'" class="m-0 list-none p-0">
          <li v-for="c in DELAY_CLASSES" :key="c.id" class="flex items-center gap-1.5">
            <span
              class="inline-block h-2.5 w-2.5 rounded-full border border-black"
              :style="{ background: classColor(c.id) }"
            />
            {{ $t(`radar.delay.${c.id}`) }}
            <span class="muted ml-auto pl-2 mono">{{ counts[c.id] }}</span>
          </li>
          <li class="flex items-center gap-1.5">
            <span
              class="inline-block h-2.5 w-2.5 rounded-full border border-black"
              :style="{ background: NO_DATA }"
            />
            {{ $t("radar.delay.nodata") }}
            <span class="muted ml-auto pl-2 mono">{{ counts.nodata }}</span>
          </li>
        </ul>
        <div
          v-if="mode === 'delay'"
          class="mt-1 flex gap-1"
          role="radiogroup"
          :aria-label="$t('radar.palette')"
        >
          <button
            class="btn chip py-0 text-xs"
            role="radio"
            :aria-checked="delayPalette === 'blue'"
            :class="delayPalette === 'blue' && 'btn-on'"
            :title="$t('radar.paletteBlueTip')"
            @click="delayPalette = 'blue'"
          >
            {{ $t("radar.paletteBlue") }}
          </button>
          <button
            class="btn chip py-0 text-xs"
            role="radio"
            :aria-checked="delayPalette === 'green'"
            :class="delayPalette === 'green' && 'btn-on'"
            @click="delayPalette = 'green'"
          >
            {{ $t("radar.paletteGreen") }}
          </button>
        </div>
        <ul v-else class="m-0 list-none p-0">
          <li v-for="c in catCounts" :key="c.cat" class="flex items-center gap-1.5">
            <span
              class="inline-block h-2.5 w-2.5 rounded-full border border-black"
              :style="{ background: c.color }"
            />
            {{ c.cat }}
            <span class="muted ml-auto pl-2 mono">{{ c.n }}</span>
          </li>
        </ul>
      </div>
    </div>
    <p class="muted mt-1 text-xs">{{ $t("radar.hint") }}</p>
  </section>
</template>

<style scoped>
.radar-panel {
  top: 0.5rem;
  right: 0.5rem;
  bottom: 0.5rem;
  width: min(26rem, calc(100% - 1rem));
}
/* phones: bottom sheet over the lower part of the map */
@media (max-width: 640px) {
  .radar-panel {
    top: auto;
    left: 0;
    right: 0;
    bottom: 0;
    width: auto;
    max-height: 55%;
    border-radius: 0.5rem 0.5rem 0 0;
  }
}
</style>
