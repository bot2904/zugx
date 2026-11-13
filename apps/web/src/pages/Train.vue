<script setup lang="ts">
// Train run ("Zuglauf"): by journey id, or friendly /train/RJX-260?d=2026-11-13.
import type { Stopover, Trip, TripMatch } from "@zugx/hafas";
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import EventTime from "../components/EventTime.vue";
import LineBadge from "../components/LineBadge.vue";
import Platform from "../components/Platform.vue";
import Remarks from "../components/Remarks.vue";
import Status from "../components/Status.vue";
import { api } from "../lib/api.ts";
import { fromLocalInput, hhmm, ms } from "../lib/format.ts";
import { delayColor, fmtSignedDelay } from "../lib/delay.ts";
import { lineColor } from "../lib/products.ts";
import { isJourneyId, slugToTrain, trainSlug } from "../lib/url.ts";
import DelaySparkline from "../viz/DelaySparkline.vue";
import MapView, { type MapLine, type MapPoint } from "../viz/MapView.vue";

const route = useRoute();
const router = useRouter();
const id = computed(() => String(route.params.id));
const date = computed(() => (typeof route.query.d === "string" ? route.query.d : ""));

const trip = shallowRef<Trip>();
const matches = shallowRef<TripMatch[]>([]);
const loading = ref(false);
const error = ref<string>();
const now = ref(Date.now());

async function load(background = false) {
  loading.value = true;
  error.value = undefined;
  try {
    let jid = id.value;
    if (!isJourneyId(jid)) {
      const name = slugToTrain(jid);
      const when = (date.value && fromLocalInput(date.value)) || new Date();
      const found = await api().tripsByName(name, when);
      const [cat, nr] = name.includes(" ") ? name.split(" ") : ["", name];
      const exact = found.filter(
        (m) =>
          (m.line.trainNumber ?? m.line.number) === nr &&
          (!cat || m.line.category.toUpperCase() === cat!.toUpperCase()),
      );
      matches.value = exact.length ? exact : found;
      if (matches.value.length !== 1) {
        trip.value = undefined;
        if (!matches.value.length) error.value = "notFound";
        return;
      }
      jid = matches.value[0]!.journeyId;
    }
    trip.value = await api(background).trip(jid, true);
    document.title = `${trip.value.line.name} → ${trip.value.direction} · zugx`;
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

watch([id, date], () => load());
onMounted(() => load());
const timer = setInterval(() => {
  now.value = Date.now();
  if (trip.value && document.visibilityState === "visible") void load(true);
}, 30_000);
onBeforeUnmount(() => clearInterval(timer));

const t = (s: Stopover) => ms(s.dep?.actual ?? s.dep?.planned ?? s.arr?.actual ?? s.arr?.planned);
const tArr = (s: Stopover) =>
  ms(s.arr?.actual ?? s.arr?.planned ?? s.dep?.actual ?? s.dep?.planned);

/** index of the last stop the train has departed from (−1 = not started) */
const position = computed(() => {
  const st = trip.value?.stopovers ?? [];
  let last = -1;
  st.forEach((s, i) => {
    if (t(s) <= now.value) last = i;
  });
  return last;
});
const atStation = (i: number) => {
  const s = trip.value?.stopovers[i];
  return !!s && tArr(s) <= now.value && t(s) > now.value;
};

const lines = computed<MapLine[]>(() => {
  const tr = trip.value;
  if (!tr) return [];
  const coords =
    tr.polyline ??
    tr.stopovers
      .filter((s) => s.stop.lat)
      .map((s) => [s.stop.lat!, s.stop.lon!] as [number, number]);
  return [{ coords, color: lineColor(tr.line) }];
});
/** delay at a stop: departure, else arrival (undefined = no realtime data) */
const delayOf = (s: Stopover) => (s.cancelled ? undefined : (s.dep?.delay ?? s.arr?.delay));

const points = computed<MapPoint[]>(() =>
  (trip.value?.stopovers ?? [])
    .filter((s) => s.stop.lat)
    .map((s, i) => ({
      lat: s.stop.lat!,
      lon: s.stop.lon!,
      label: `${s.stop.name} ${hhmm(s.arr?.planned ?? s.dep?.planned)}${delayOf(s) === undefined ? "" : ` · ${fmtSignedDelay(delayOf(s)!)}`}`,
      id: s.stop.id,
      // delay colours as on the radar; passed stops slightly smaller via no "big"
      color: delayColor(delayOf(s)),
      stroke: "#fff", // stands out on the (category-coloured) route line
      big: i > position.value,
    })),
);

/** "RJX 162" or, for S-Bahn lines, category + train number ("S 22734") */
const trainName = computed(() => {
  const l = trip.value?.line;
  if (!l) return "";
  return l.trainNumber ? `${l.category.toUpperCase()} ${l.trainNumber}` : l.name;
});

const tripDate = computed(() => {
  const d = trip.value?.date;
  return d ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : "";
});

function goDay(delta: number) {
  if (!trip.value) return;
  const base = new Date(`${tripDate.value}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + delta);
  void router.push({
    path: `/train/${trainSlug(trainName.value)}`,
    query: { d: base.toISOString().slice(0, 10) },
  });
}
</script>

<template>
  <section>
    <Status
      :loading="loading && !trip && !matches.length"
      :error="error && error !== 'notFound' ? error : undefined"
      @retry="load"
    />
    <p v-if="error === 'notFound'" class="muted">
      {{ $t("trip.notFound") }} ({{ slugToTrain(id) }})
    </p>

    <ul v-if="!trip && matches.length > 1" class="m-0 list-none p-0">
      <li v-for="m in matches" :key="m.journeyId" class="my-1">
        <RouterLink
          :to="`/train/${encodeURIComponent(m.journeyId)}`"
          class="flex items-center gap-2 text-[var(--fg)]"
        >
          <LineBadge :line="m.line" />
          <span
            >{{ m.origin?.name }} {{ hhmm(m.dep?.planned) }} → {{ m.destination?.name }}
            {{ hhmm(m.arr?.planned) }}</span
          >
        </RouterLink>
      </li>
    </ul>

    <template v-if="trip">
      <div class="flex flex-wrap items-center gap-2">
        <LineBadge :line="trip.line" />
        <span v-if="trip.line.trainNumber" class="mono muted text-sm"
          >{{ $t("trip.trainNumber") }} {{ trip.line.trainNumber }}</span
        >
        <h1 class="m-0 text-xl">→ {{ trip.direction }}</h1>
        <span class="muted text-sm"
          >{{ trip.line.categoryLong
          }}<template v-if="trip.line.operator"> · {{ trip.line.operator }}</template></span
        >
        <span class="ml-auto flex items-center gap-1 text-sm">
          <button
            class="btn"
            :aria-label="$t('bf.prevDay')"
            :title="$t('bf.prevDay')"
            @click="goDay(-1)"
          >
            ‹
          </button>
          <span class="mono">{{ tripDate }}</span>
          <button
            class="btn"
            :aria-label="$t('bf.nextDay')"
            :title="$t('bf.nextDay')"
            @click="goDay(1)"
          >
            ›
          </button>
          <RouterLink :to="`/trains?q=${encodeURIComponent(trainName)}`" class="btn">{{
            $t("nav.trains")
          }}</RouterLink>
        </span>
      </div>
      <p v-if="trip.runningDays" class="muted my-1 text-xs">
        {{ $t("trip.runningDays") }}: {{ trip.runningDays }}
      </p>
      <Remarks :remarks="trip.remarks" class="my-2" />

      <div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div class="card p-3">
          <h2 class="muted m-0 mb-1 text-xs uppercase">{{ $t("trip.delayProfile") }}</h2>
          <DelaySparkline :stops="trip.stopovers" />
          <ol class="m-0 mt-2 list-none p-0">
            <li
              v-for="(s, i) in trip.stopovers"
              :key="i"
              class="relative grid grid-cols-[1.25rem_4.4rem_4.4rem_1fr_auto] items-center gap-x-2 py-0.5 text-sm"
              :class="[s.cancelled && 'line-through muted', i <= position && 'opacity-60']"
            >
              <span class="relative flex h-full justify-center">
                <span
                  class="absolute w-1"
                  :class="
                    i === 0
                      ? 'top-1/2 bottom-0'
                      : i === trip.stopovers.length - 1
                        ? 'top-0 bottom-1/2'
                        : 'inset-y-0'
                  "
                  :style="{ background: lineColor(trip.line) }"
                />
                <span
                  class="z-1 my-auto block h-2.5 w-2.5 rounded-full border-2"
                  :class="atStation(i) ? 'animate-pulse' : ''"
                  :style="{
                    borderColor: lineColor(trip.line),
                    background:
                      atStation(i) || i === position ? lineColor(trip.line) : 'var(--bg2)',
                  }"
                />
              </span>
              <!-- wrappers keep the grid columns when arr (origin) or dep (destination) is missing -->
              <span><EventTime :ev="s.arr" /></span>
              <span><EventTime :ev="s.dep" /></span>
              <RouterLink :to="`/station/${s.stop.id}`" class="text-[var(--fg)]">
                {{ s.stop.name }}
                <span v-if="s.additional" class="text-xs text-[var(--warn)]">+</span>
              </RouterLink>
              <span class="text-right text-xs"><Platform :ev="s.dep ?? s.arr" /></span>
              <Remarks
                v-if="s.remarks?.length"
                :remarks="s.remarks"
                compact
                class="col-start-4 col-end-6"
              />
            </li>
          </ol>
        </div>
        <MapView
          :lines="lines"
          :points="points"
          height="560px"
          @click-point="(sid) => router.push(`/station/${sid}`)"
        />
      </div>
    </template>
  </section>
</template>
