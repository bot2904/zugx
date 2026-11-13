<script setup lang="ts">
// Permalink for one connection: refreshed via its reconstruction token.
import type { Journey, Leg } from "@zugx/hafas";
import { computed, onBeforeUnmount, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import EventTime from "../components/EventTime.vue";
import LegList from "../components/LegList.vue";
import Status from "../components/Status.vue";
import { api } from "../lib/api.ts";
import { useAsync } from "../lib/async.ts";
import { fmtDuration, toLocalInput } from "../lib/format.ts";
import { lineColor } from "../lib/products.ts";
import { unb64url } from "../lib/url.ts";
import MapView, { type MapLine, type MapPoint } from "../viz/MapView.vue";

const route = useRoute();
const router = useRouter();
const recon = computed(() => {
  try {
    return unb64url(String(route.params.recon));
  } catch {
    return "";
  }
});

const j = useAsync<Journey | undefined>(() => api().refreshJourney(recon.value, true));
onMounted(j.run);
const timer = setInterval(() => document.visibilityState === "visible" && void j.run(), 60_000);
onBeforeUnmount(() => clearInterval(timer));

const lines = computed<MapLine[]>(() =>
  (j.data.value?.legs ?? []).map((l) => ({
    coords:
      l.polyline ??
      (l.stopovers?.length
        ? l.stopovers
            .filter((s) => s.stop.lat)
            .map((s) => [s.stop.lat!, s.stop.lon!] as [number, number])
        : [
            [l.origin.lat ?? 0, l.origin.lon ?? 0],
            [l.destination.lat ?? 0, l.destination.lon ?? 0],
          ]),
    color: l.kind === "journey" ? lineColor(l.line) : "#8a929c",
    dashed: l.kind !== "journey",
  })),
);
const points = computed<MapPoint[]>(() =>
  (j.data.value?.legs ?? [])
    .flatMap((l) => [l.origin, l.destination])
    .filter((s) => s.lat)
    .map((s) => ({ lat: s.lat!, lon: s.lon!, label: s.name, id: s.id, big: true })),
);

function missed(leg: Leg) {
  const dest = j.data.value?.legs.at(-1)?.destination.id;
  if (!dest) return;
  void router.push({
    path: `/j/${leg.origin.id}/${dest}`,
    query: { t: toLocalInput(new Date(Date.parse(leg.dep.planned) + 60_000)) },
  });
}
</script>

<template>
  <section>
    <Status :loading="j.loading.value && !j.data.value" :error="j.error.value" @retry="j.run" />
    <template v-if="j.data.value">
      <h1 class="m-0 text-xl">
        {{ j.data.value.legs[0]?.origin.name }} <span class="muted">→</span>
        {{ j.data.value.legs.at(-1)?.destination.name }}
      </h1>
      <p class="mono muted my-1 text-sm">
        <EventTime :ev="j.data.value.dep" show-actual /> –
        <EventTime :ev="j.data.value.arr" show-actual /> ·
        {{ fmtDuration(j.data.value.duration) }} · {{ j.data.value.transfers }}× ·
        {{ j.data.value.dep.planned.slice(0, 10) }}
      </p>
      <div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div class="card p-3"><LegList :journey="j.data.value" @missed="missed" /></div>
        <MapView :lines="lines" :points="points" height="520px" />
      </div>
    </template>
  </section>
</template>
