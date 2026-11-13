<script setup lang="ts">
import { useClipboard } from "@vueuse/core";
import type { Journey, JourneysResult, Leg } from "@zugx/hafas";
import { computed, nextTick, onMounted, ref, shallowRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import CalendarButton from "../components/CalendarButton.vue";
import EventTime from "../components/EventTime.vue";
import LegList from "../components/LegList.vue";
import LineBadge from "../components/LineBadge.vue";
import Platform from "../components/Platform.vue";
import Status from "../components/Status.vue";
import { api } from "../lib/api.ts";
import { fmtDuration, fromLocalInput, toLocalInput } from "../lib/format.ts";
import { useKeys } from "../lib/keys.ts";
import { ALL_CLS, PRODUCT_GROUPS } from "../lib/products.ts";
import { loadStations, stationById } from "../lib/stations.ts";
import { addRecentJourney, state } from "../lib/store.ts";
import { b64url } from "../lib/url.ts";
import TimelineStrips from "../viz/TimelineStrips.vue";

const route = useRoute();
const router = useRouter();

const from = computed(() => String(route.params.from));
const to = computed(() => String(route.params.to));
const via = computed(() => (typeof route.query.via === "string" ? route.query.via : undefined));
const t = computed(() => (typeof route.query.t === "string" ? route.query.t : ""));
const arrival = computed(() => route.query.arr !== undefined);
const products = computed(() =>
  typeof route.query.p === "string" ? Number(route.query.p) : ALL_CLS,
);
const transferTime = computed(() =>
  typeof route.query.chg === "string" ? Number(route.query.chg) : undefined,
);

const journeys = shallowRef<Journey[]>([]);
const earlierRef = ref<string>();
const laterRef = ref<string>();
const loading = ref(false);
const error = ref<string>();
const sel = ref(Number(route.hash.slice(1)) || 0);
const expanded = ref<number | undefined>(route.hash ? Number(route.hash.slice(1)) : undefined);
const compare = ref(new Set<number>());
const names = ref({ from: "", to: "", via: "" });
const { copy: copyText, copied } = useClipboard({ copiedDuring: 2000 });

const opts = () => ({
  when: (t.value && fromLocalInput(t.value)) || new Date(),
  arrival: arrival.value,
  via: via.value,
  products: products.value,
  transferTime: transferTime.value,
  results: 6,
});

async function search() {
  loading.value = true;
  error.value = undefined;
  try {
    const r: JourneysResult = await api().journeys(from.value, to.value, opts());
    journeys.value = r.journeys;
    earlierRef.value = r.earlierRef;
    laterRef.value = r.laterRef;
    compare.value = new Set();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

async function page(dir: "earlier" | "later") {
  const ref_ = dir === "earlier" ? earlierRef.value : laterRef.value;
  if (!ref_) return;
  loading.value = true;
  try {
    const r = await api().journeys(from.value, to.value, { ...opts(), ref: ref_ });
    const key = (j: Journey) => j.legs.map((l) => `${l.journeyId}${l.dep.planned}`).join("|");
    const have = new Set(journeys.value.map(key));
    const fresh = r.journeys.filter((j) => !have.has(key(j)));
    if (dir === "earlier") {
      journeys.value = [...fresh, ...journeys.value];
      earlierRef.value = r.earlierRef;
      sel.value += fresh.length;
      if (expanded.value !== undefined) expanded.value += fresh.length;
    } else {
      journeys.value = [...journeys.value, ...fresh];
      laterRef.value = r.laterRef;
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

async function resolveNames() {
  await loadStations();
  const n = (id?: string) => (id ? (stationById(id)?.name ?? "") : "");
  names.value = { from: n(from.value), to: n(to.value), via: n(via.value) };
  const j = journeys.value[0];
  if (j) {
    names.value.from ||= j.legs[0]?.origin.name ?? from.value;
    names.value.to ||= j.legs.at(-1)?.destination.name ?? to.value;
  }
  if (names.value.from && names.value.to) {
    addRecentJourney(
      { id: from.value, name: names.value.from },
      { id: to.value, name: names.value.to },
    );
    document.title = `${names.value.from} → ${names.value.to} · zugx`;
  }
}

watch([from, to, via, t, arrival, products, transferTime], () => void search().then(resolveNames));
// a permalink with #n opens connection n: once loaded, bring its details into view (content is async,
// so neither the URL fragment nor scroll-initial-target can do it)
const details = ref<HTMLElement>();
onMounted(async () => {
  await search();
  void resolveNames();
  if (route.hash && expanded.value !== undefined) {
    await nextTick();
    details.value?.scrollIntoView({ block: "start" });
  }
});

function setQuery(q: Record<string, string | undefined>) {
  const next = { ...route.query, ...q };
  for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
  void router.replace({ query: next });
}

function toggleProduct(cls: number) {
  const p = products.value ^ cls;
  setQuery({ p: p === ALL_CLS ? undefined : String(p || ALL_CLS) });
}

function select(i: number) {
  sel.value = i;
  expanded.value = expanded.value === i ? undefined : i;
  void router.replace({ query: route.query, hash: expanded.value === undefined ? "" : `#${i}` });
}

function toggleCompare(i: number) {
  const s = new Set(compare.value);
  if (s.has(i)) s.delete(i);
  else s.add(i);
  compare.value = s;
}

const permalink = (j: Journey) => (j.recon ? `/trip/${b64url(j.recon)}` : undefined);

async function share(j: Journey) {
  const p = permalink(j);
  if (!p) return;
  await copyText(location.origin + p);
}

function missed(leg: Leg) {
  // re-plan from the transfer station after the planned departure of the connection
  const q: Record<string, string> = {
    t: toLocalInput(new Date(Date.parse(leg.dep.planned) + 60_000)),
  };
  void router.push({ path: `/j/${leg.origin.id}/${to.value}`, query: q });
}

const products_ = (j: Journey) => j.legs.filter((l) => l.kind === "journey" && l.line);
const comparing = computed(
  () =>
    [...compare.value]
      .sort((a, b) => a - b)
      .map((i) => journeys.value[i])
      .filter(Boolean) as Journey[],
);

useKeys({
  j: () => (sel.value = Math.min(journeys.value.length - 1, sel.value + 1)),
  k: () => (sel.value = Math.max(0, sel.value - 1)),
  Enter: () => select(sel.value),
  h: () => void page("earlier"),
  l: () => void page("later"),
  x: () => toggleCompare(sel.value),
  v: () => (state.view = state.view === "timeline" ? "table" : "timeline"),
  s: () => void router.push(`/j/${to.value}/${from.value}${t.value ? `?t=${t.value}` : ""}`),
});
</script>

<template>
  <section>
    <div class="flex flex-wrap items-baseline gap-2">
      <h1 class="m-0 text-xl">
        <RouterLink :to="`/station/${from}`" class="text-[var(--fg)]">{{
          names.from || from
        }}</RouterLink>
        <span class="muted"> → </span>
        <RouterLink :to="`/station/${to}`" class="text-[var(--fg)]">{{
          names.to || to
        }}</RouterLink>
      </h1>
      <span v-if="via" class="muted text-sm">{{ $t("search.via") }} {{ names.via || via }}</span>
      <RouterLink
        :to="`/j/${to}/${from}`"
        class="btn text-xs"
        :title="$t('search.swap') + ' (s)'"
        :aria-label="$t('search.swap') + ' (s)'"
        >⇄</RouterLink
      >
      <div class="ml-auto flex gap-1">
        <button
          class="btn"
          :class="state.view === 'timeline' && 'btn-on'"
          @click="state.view = 'timeline'"
        >
          {{ $t("journeys.timeline") }}
        </button>
        <button
          class="btn"
          :class="state.view === 'table' && 'btn-on'"
          @click="state.view = 'table'"
        >
          {{ $t("journeys.table") }} <span class="kbd">v</span>
        </button>
      </div>
    </div>

    <div class="my-2 flex flex-wrap items-center gap-1 text-xs">
      <span class="chips flex flex-wrap gap-1">
        <button
          v-for="g in PRODUCT_GROUPS"
          :key="g.id"
          class="btn chip py-0.5 text-xs"
          :class="products & g.cls ? 'btn-on' : 'muted line-through'"
          @click="toggleProduct(g.cls)"
        >
          {{ $t(`products.${g.id}`) }}
        </button>
      </span>
      <span class="ml-auto flex flex-wrap items-center gap-1">
        <label class="flex items-center gap-1">
          <input
            type="checkbox"
            :checked="arrival"
            @change="setQuery({ arr: arrival ? undefined : '1' })"
          />
          {{ $t("search.arrival") }}
        </label>
        <input
          type="datetime-local"
          class="input text-xs"
          :aria-label="$t('board.time')"
          :value="t || toLocalInput(new Date())"
          @change="setQuery({ t: ($event.target as HTMLInputElement).value || undefined })"
        />
        <select
          class="input text-xs"
          :value="transferTime ?? ''"
          :title="$t('journeys.transfers')"
          @change="setQuery({ chg: ($event.target as HTMLSelectElement).value || undefined })"
        >
          <option value="">⇄ auto</option>
          <option v-for="m in [5, 10, 15, 20, 30]" :key="m" :value="m">⇄ ≥{{ m }}′</option>
        </select>
      </span>
    </div>

    <Status :loading="loading && !journeys.length" :error="error" @retry="search" />

    <div v-if="journeys.length" class="card p-2">
      <button
        class="btn mb-2 w-full justify-center text-xs"
        :disabled="loading || !earlierRef"
        @click="page('earlier')"
      >
        ▲ {{ $t("journeys.earlier") }} <span class="kbd">h</span>
      </button>

      <div v-if="state.view === 'timeline'" class="grid grid-cols-[auto_1fr] gap-x-2">
        <div class="pt-[22px]">
          <div
            v-for="(j, i) in journeys"
            :key="i"
            class="flex h-[34px] cursor-pointer items-center gap-2 pr-1 text-sm"
            :class="i === sel && 'bg-[var(--bg3)]'"
            @click="select(i)"
          >
            <input
              type="checkbox"
              :checked="compare.has(i)"
              :title="$t('journeys.compare') + ' (x)'"
              :aria-label="$t('journeys.compare')"
              @click.stop="toggleCompare(i)"
            />
            <EventTime :ev="j.dep" />
            <span class="muted">–</span>
            <EventTime :ev="j.arr" />
            <span class="muted mono text-xs">{{ j.transfers }}×</span>
          </div>
        </div>
        <TimelineStrips :journeys="journeys" :selected="sel" @select="select" />
      </div>

      <table v-else class="dense">
        <caption class="sr-only">
          {{ $t("journeys.title") }}
        </caption>
        <thead>
          <tr>
            <th />
            <th>{{ $t("journeys.dep") }}</th>
            <th>{{ $t("journeys.arr") }}</th>
            <th>{{ $t("journeys.duration") }}</th>
            <th>{{ $t("journeys.transfers") }}</th>
            <th>{{ $t("journeys.products") }}</th>
            <th class="text-right">{{ $t("board.platform") }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(j, i) in journeys"
            :key="i"
            class="cursor-pointer"
            :class="i === sel && 'sel'"
            @click="select(i)"
          >
            <td>
              <input
                type="checkbox"
                :checked="compare.has(i)"
                :aria-label="$t('journeys.compare')"
                @click.stop="toggleCompare(i)"
              />
            </td>
            <td><EventTime :ev="j.dep" show-actual /></td>
            <td><EventTime :ev="j.arr" show-actual /></td>
            <td class="mono">{{ fmtDuration(j.duration) }}</td>
            <td class="mono">{{ j.transfers }}</td>
            <td>
              <div class="flex flex-wrap gap-1">
                <LineBadge v-for="(l, k) in products_(j)" :key="k" :line="l.line" small />
              </div>
            </td>
            <td class="text-right">
              <Platform :ev="j.legs.find((l) => l.kind === 'journey')?.dep" />
            </td>
          </tr>
        </tbody>
      </table>

      <button
        class="btn mt-2 w-full justify-center text-xs"
        :disabled="loading || !laterRef"
        @click="page('later')"
      >
        ▼ {{ $t("journeys.later") }} <span class="kbd">l</span>
      </button>
    </div>
    <p v-else-if="!loading && !error" class="muted">{{ $t("journeys.empty") }}</p>

    <article
      v-if="expanded !== undefined && journeys[expanded]"
      ref="details"
      class="card mt-3 scroll-mt-2 p-3"
    >
      <div class="mb-2 flex items-center gap-2 text-sm">
        <b>{{ $t("journeys.details") }}</b>
        <span class="mono muted"
          >{{ fmtDuration(journeys[expanded]!.duration) }} ·
          {{ journeys[expanded]!.transfers }}×</span
        >
        <RouterLink
          v-if="permalink(journeys[expanded]!)"
          :to="permalink(journeys[expanded]!)!"
          class="btn ml-auto text-xs"
        >
          🗺 {{ $t("trip.map") }}
        </RouterLink>
        <button class="btn text-xs" @click="share(journeys[expanded]!)">
          🔗 {{ $t("journeys.share") }}
        </button>
        <span role="status" class="muted text-xs">{{ copied ? $t("journeys.copied") : "" }}</span>
        <CalendarButton :journey="journeys[expanded]!" />
      </div>
      <LegList :journey="journeys[expanded]!" @missed="missed" />
    </article>

    <section v-if="comparing.length > 1" class="mt-3">
      <h2 class="text-base">{{ $t("journeys.compare") }} ({{ comparing.length }})</h2>
      <div
        class="grid gap-3"
        :style="{ gridTemplateColumns: `repeat(${comparing.length}, minmax(260px, 1fr))` }"
      >
        <div v-for="(j, i) in comparing" :key="i" class="card overflow-auto p-2 text-sm">
          <div class="mono mb-1">
            <EventTime :ev="j.dep" /> – <EventTime :ev="j.arr" /> · {{ fmtDuration(j.duration) }} ·
            {{ j.transfers }}×
          </div>
          <LegList :journey="j" @missed="missed" />
        </div>
      </div>
    </section>
  </section>
</template>
