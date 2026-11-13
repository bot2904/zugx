<script setup lang="ts">
// Index of Bildfahrplan corridors: filter by name/station, sortable, keyboard navigation.
import type { CorridorIndex, CorridorIndexEntry } from "@zugx/netz";
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useKeys } from "../lib/keys.ts";
import { normalize } from "../lib/normalize.ts";
import { categoryColor } from "../lib/products.ts";

const props = defineProps<{ index: CorridorIndex }>();
const route = useRoute();
const router = useRouter();

const q = ref(typeof route.query.q === "string" ? route.query.q : "");
type SortKey = "name" | "km" | "stations" | "trains";
const sort = ref<SortKey>("name");
const desc = ref(false);
const sel = ref(-1);

watch(q, (v) => void router.replace({ query: v ? { q: v } : {} }));

const rows = computed<CorridorIndexEntry[]>(() => {
  const tokens = normalize(q.value).split(" ").filter(Boolean);
  const list = props.index.corridors.filter((c) => {
    if (!tokens.length) return true;
    const hay = normalize(`${c.name} ${c.names.join(" ")}`);
    return tokens.every((tok) => hay.includes(tok));
  });
  const dir = desc.value ? -1 : 1;
  return list.sort((a, b) =>
    sort.value === "name"
      ? dir * a.name.localeCompare(b.name)
      : dir * (a[sort.value] - b[sort.value]),
  );
});

/** matching station names for the current query (shown under the corridor) */
function hits(c: CorridorIndexEntry): string[] {
  const tokens = normalize(q.value).split(" ").filter(Boolean);
  if (!tokens.length) return [];
  return c.names.filter((n) => tokens.every((t) => normalize(n).includes(t))).slice(0, 3);
}

function sortBy(k: SortKey) {
  if (sort.value === k) desc.value = !desc.value;
  else {
    sort.value = k;
    desc.value = k !== "name";
  }
}

const catBar = (c: CorridorIndexEntry) => {
  const total = Object.values(c.cats).reduce((a, b) => a + b, 0) || 1;
  let x = 0;
  return Object.entries(c.cats).map(([cat, n]) => {
    const w = (n / total) * 100;
    const seg = { cat, n, x, w };
    x += w;
    return seg;
  });
};

const open = (c?: CorridorIndexEntry) => c && void router.push(`/bf/${c.id}`);
useKeys({
  j: () => (sel.value = Math.min(rows.value.length - 1, sel.value + 1)),
  k: () => (sel.value = Math.max(0, sel.value - 1)),
  Enter: () => open(rows.value[sel.value] ?? (rows.value.length === 1 ? rows.value[0] : undefined)),
});
const arrow = (k: SortKey) => (sort.value === k ? (desc.value ? " ↓" : " ↑") : "");
</script>

<template>
  <section>
    <div class="flex flex-wrap items-baseline gap-2">
      <h1 class="m-0 text-xl">{{ $t("bf.title") }}</h1>
      <span class="muted text-sm">{{ $t("bf.subtitle", { n: index.corridors.length }) }}</span>
      <input
        v-model="q"
        class="input ml-auto min-w-56 text-sm"
        :placeholder="$t('bf.filter')"
        autofocus
        @keydown.enter="open(rows[0])"
      />
    </div>
    <p class="muted my-1 text-xs">
      {{ rows.length }} / {{ index.corridors.length }} · {{ index.day }} · {{ index.source }}
    </p>
    <table class="dense mt-1">
      <thead>
        <tr>
          <th class="cursor-pointer" @click="sortBy('name')">
            {{ $t("bf.corridor") }}{{ arrow("name") }}
          </th>
          <th class="hide-sm">{{ $t("trains.route") }}</th>
          <th class="cursor-pointer text-right" @click="sortBy('km')">km{{ arrow("km") }}</th>
          <th class="hide-sm cursor-pointer text-right" @click="sortBy('stations')">
            {{ $t("bf.stations") }}{{ arrow("stations") }}
          </th>
          <th class="cursor-pointer text-right" @click="sortBy('trains')">
            {{ $t("bf.trains") }}{{ arrow("trains") }}
          </th>
          <th class="hide-sm" :title="$t('bf.mixTip')">{{ $t("bf.mix") }}</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(c, i) in rows"
          :key="c.id"
          :data-row="i"
          class="cursor-pointer"
          :class="i === sel && 'sel'"
          @click="open(c)"
        >
          <td>
            <RouterLink :to="`/bf/${c.id}`" class="font-medium text-[var(--fg)]" @click.stop>{{
              c.name
            }}</RouterLink>
            <div v-if="hits(c).length" class="text-xs text-[var(--warn)]">
              ⌖ {{ hits(c).join(" · ") }}
            </div>
          </td>
          <td class="hide-sm muted text-xs">{{ c.major.join(" · ") }}</td>
          <td class="mono text-right">{{ Math.round(c.km) }}</td>
          <td class="hide-sm mono text-right">{{ c.stations }}</td>
          <td class="mono text-right">{{ c.trains }}</td>
          <td class="hide-sm w-[180px]">
            <svg
              viewBox="0 0 100 8"
              width="170"
              height="10"
              preserveAspectRatio="none"
              class="block"
            >
              <rect
                v-for="s in catBar(c)"
                :key="s.cat"
                :x="s.x"
                y="0"
                :width="s.w"
                height="8"
                :fill="categoryColor(s.cat)"
              >
                <title>{{ s.cat }}: {{ s.n }}</title>
              </rect>
            </svg>
            <div
              class="muted mono overflow-hidden text-ellipsis whitespace-nowrap text-[10px]"
              style="max-width: 170px"
            >
              {{
                Object.entries(c.cats)
                  .slice(0, 3)
                  .map(([k, n]) => `${k} ${n}`)
                  .join(" · ")
              }}
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
