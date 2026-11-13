<script setup lang="ts">
// Live train positions (HAFAS JourneyGeoPos) for the visible map area.
import type { Movement } from "@zugx/hafas";
import type { Map as MlMap } from "maplibre-gl";
import { computed, onBeforeUnmount, ref, shallowRef } from "vue";
import { useRouter } from "vue-router";
import Status from "../components/Status.vue";
import { api } from "../lib/api.ts";
import { lineColor, PRODUCT_GROUPS, RAIL_CLS } from "../lib/products.ts";
import MapView, { type MapPoint } from "../viz/MapView.vue";

const router = useRouter();
const movements = shallowRef<Movement[]>([]);
const error = ref<string>();
const loading = ref(false);
const products = ref(RAIL_CLS);
let map: MlMap | undefined;

async function refresh() {
  if (!map) return;
  const b = map.getBounds();
  loading.value = true;
  try {
    movements.value = await api().radar(
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
let debounce: ReturnType<typeof setTimeout> | undefined;
function onMove() {
  clearTimeout(debounce);
  debounce = setTimeout(refresh, 400);
}
const timer = setInterval(() => document.visibilityState === "visible" && void refresh(), 15_000);
onBeforeUnmount(() => clearInterval(timer));

const points = computed<MapPoint[]>(() =>
  movements.value.map((m) => ({
    lat: m.lat,
    lon: m.lon,
    id: m.journeyId,
    color: lineColor(m.line),
    label: `${m.line.name} → ${m.direction}`,
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
      <span class="ml-auto flex flex-wrap gap-1">
        <button
          v-for="g in PRODUCT_GROUPS.slice(0, 7)"
          :key="g.id"
          class="btn py-0.5 text-xs"
          :class="products & g.cls ? 'btn-on' : 'muted line-through'"
          @click="toggle(g.cls)"
        >
          {{ $t(`products.${g.id}`) }}
        </button>
      </span>
    </div>
    <Status :error="error" @retry="refresh" />
    <MapView
      :points="points"
      :fit="false"
      height="calc(100vh - 170px)"
      @ready="onReady"
      @moveend="onMove"
      @click-point="(jid) => router.push(`/train/${encodeURIComponent(jid)}`)"
    />
    <p class="muted mt-1 text-xs">{{ $t("radar.hint") }}</p>
  </section>
</template>
