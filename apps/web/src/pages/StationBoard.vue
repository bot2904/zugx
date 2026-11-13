<script setup lang="ts">
import type { BoardEntry } from "@zugx/hafas";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import EventTime from "../components/EventTime.vue";
import LineBadge from "../components/LineBadge.vue";
import Platform from "../components/Platform.vue";
import Remarks from "../components/Remarks.vue";
import Status from "../components/Status.vue";
import { api } from "../lib/api.ts";
import { useAsync } from "../lib/async.ts";
import { fromLocalInput, hhmm, toLocalInput } from "../lib/format.ts";
import { useKeys } from "../lib/keys.ts";
import { PRODUCT_GROUPS, RAIL_CLS } from "../lib/products.ts";
import { loadStations, stationById } from "../lib/stations.ts";
import { addRecent, isFavourite, toggleFavourite } from "../lib/store.ts";

const route = useRoute();
const router = useRouter();

const id = computed(() => String(route.params.id));
const arrivals = computed(() => route.query.arr !== undefined);
const t = computed(() => (typeof route.query.t === "string" ? route.query.t : ""));
const products = computed(() =>
  typeof route.query.p === "string" ? Number(route.query.p) : RAIL_CLS,
);
const name = ref("");
const sel = ref(-1);
const expanded = ref<string>();
const auto = ref(true);

const board = useAsync<BoardEntry[]>(() =>
  api().board(id.value, {
    arrivals: arrivals.value,
    when: (t.value && fromLocalInput(t.value)) || new Date(),
    duration: 90,
    results: 60,
    products: products.value,
  }),
);

async function resolveName() {
  await loadStations();
  name.value = stationById(id.value)?.name ?? "";
  if (!name.value) {
    const r = await api()
      .locations(id.value, 1)
      .catch(() => []);
    name.value = r[0]?.name ?? id.value;
  }
  addRecent({ id: id.value, name: name.value });
  document.title = `${name.value} · zugx`;
}

watch([id, arrivals, t, products], () => {
  sel.value = -1;
  void board.run();
});
watch(id, resolveName);
onMounted(() => {
  void board.run();
  void resolveName();
});

let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  timer = setInterval(() => {
    if (auto.value && !t.value && document.visibilityState === "visible") void board.run();
  }, 30_000);
});
onBeforeUnmount(() => clearInterval(timer));

function setQuery(q: Record<string, string | undefined>) {
  const next = { ...route.query, ...q };
  for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
  void router.replace({ query: next });
}

function shift(min: number) {
  const base = (t.value && fromLocalInput(t.value)) || new Date();
  setQuery({ t: toLocalInput(new Date(base.getTime() + min * 60_000)) });
}

function toggleProduct(cls: number) {
  const p = products.value ^ cls;
  setQuery({ p: p === RAIL_CLS ? undefined : String(p || RAIL_CLS) });
}

const rows = computed(() => board.data.value ?? []);

function open(e?: BoardEntry) {
  if (e) void router.push(`/train/${encodeURIComponent(e.journeyId)}`);
}

useKeys({
  j: () => (sel.value = Math.min(rows.value.length - 1, sel.value + 1)),
  k: () => (sel.value = Math.max(0, sel.value - 1)),
  Enter: () => open(rows.value[sel.value]),
  h: () => shift(-60),
  l: () => shift(60),
  a: () => setQuery({ arr: arrivals.value ? undefined : "" }),
  f: () => toggleFavourite({ id: id.value, name: name.value }),
});

watch(sel, (i) =>
  document.querySelector(`[data-row="${i}"]`)?.scrollIntoView({ block: "nearest" }),
);
</script>

<template>
  <section>
    <div class="flex flex-wrap items-center gap-2">
      <h1 class="m-0 text-xl">{{ name || id }}</h1>
      <button
        class="btn border-0 text-lg"
        :class="isFavourite(id) ? 'text-[var(--warn)]' : 'muted'"
        :title="$t('search.favourites') + ' (f)'"
        @click="toggleFavourite({ id, name })"
      >
        ★
      </button>
      <span class="muted mono text-xs">{{ id }}</span>
      <div class="ml-auto flex gap-1">
        <button class="btn" :class="!arrivals && 'btn-on'" @click="setQuery({ arr: undefined })">
          {{ $t("board.departures") }}
        </button>
        <button class="btn" :class="arrivals && 'btn-on'" @click="setQuery({ arr: '' })">
          {{ $t("board.arrivals") }} <span class="kbd">a</span>
        </button>
      </div>
    </div>

    <div class="my-2 flex flex-wrap items-center gap-1 text-xs">
      <button
        v-for="g in PRODUCT_GROUPS"
        :key="g.id"
        class="btn py-0.5 text-xs"
        :class="products & g.cls ? 'btn-on' : 'muted line-through'"
        @click="toggleProduct(g.cls)"
      >
        {{ $t(`products.${g.id}`) }}
      </button>
      <span class="ml-auto flex items-center gap-1">
        <button class="btn" @click="shift(-60)">
          ‹ {{ $t("board.earlier") }} <span class="kbd">h</span>
        </button>
        <input
          type="datetime-local"
          class="input text-xs"
          :value="t || toLocalInput(new Date())"
          @change="setQuery({ t: ($event.target as HTMLInputElement).value || undefined })"
        />
        <button v-if="t" class="btn" @click="setQuery({ t: undefined })">
          {{ $t("search.now") }}
        </button>
        <button class="btn" @click="shift(60)">
          {{ $t("board.later") }} <span class="kbd">l</span> ›
        </button>
        <label class="ml-2 flex items-center gap-1 muted" :title="$t('board.autoRefresh')">
          <input v-model="auto" type="checkbox" /> ⟳ 30s
        </label>
      </span>
    </div>

    <Status
      :loading="board.loading.value && !rows.length"
      :error="board.error.value"
      @retry="board.run"
    />

    <table v-if="rows.length" class="dense">
      <thead>
        <tr>
          <th>{{ $t("board.time") }}</th>
          <th>{{ $t("board.line") }}</th>
          <th>{{ arrivals ? $t("board.from") : $t("board.direction") }}</th>
          <th class="text-right">{{ $t("board.platform") }}</th>
        </tr>
      </thead>
      <tbody>
        <template v-for="(e, i) in rows" :key="e.journeyId + e.when.planned">
          <tr
            :data-row="i"
            class="cursor-pointer"
            :class="[i === sel && 'sel', e.cancelled && 'opacity-60']"
            @click="expanded = expanded === e.journeyId ? undefined : e.journeyId"
            @dblclick="open(e)"
          >
            <td class="w-20"><EventTime :ev="e.when" show-actual /></td>
            <td class="w-28"><LineBadge :line="e.line" /></td>
            <td>
              <RouterLink
                :to="`/train/${encodeURIComponent(e.journeyId)}`"
                class="text-[var(--fg)]"
                @click.stop
                >{{ e.direction }}</RouterLink
              >
              <span v-if="e.cancelled" class="ml-2 text-xs text-[var(--bad)]">{{
                $t("board.cancelled")
              }}</span>
              <span
                v-if="e.remarks.some((r) => r.kind === 'warning')"
                class="ml-1 text-[var(--warn)]"
                title="!"
                >⚠</span
              >
              <span
                v-if="e.line.operator && e.line.operator !== 'ÖBB'"
                class="muted ml-2 text-xs hide-sm"
                >{{ e.line.operator }}</span
              >
            </td>
            <td class="w-12 text-right"><Platform :ev="e.when" /></td>
          </tr>
          <tr v-if="expanded === e.journeyId">
            <td colspan="4" class="bg-[var(--bg2)]">
              <Remarks :remarks="e.remarks" />
              <RouterLink :to="`/train/${encodeURIComponent(e.journeyId)}`" class="text-xs"
                >{{ $t("trip.title") }} →</RouterLink
              >
            </td>
          </tr>
        </template>
      </tbody>
    </table>
    <p v-else-if="!board.loading.value && !board.error.value" class="muted">
      {{ $t("board.empty") }}
    </p>
    <p v-if="rows.length" class="muted mt-2 text-xs">
      {{ hhmm(rows[0]?.when.planned) }} – {{ hhmm(rows.at(-1)?.when.planned) }} ·
      {{ rows.length }} · <span class="kbd">j</span>/<span class="kbd">k</span> <span class="kbd"
        >↵</span
      >
    </p>
  </section>
</template>
