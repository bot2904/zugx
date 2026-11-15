<script setup lang="ts">
// Index of the VzG lines (Streckennummern): filter by number/name/station, sortable, keyboard
// navigation — like the Bildfahrplan index.
import type { VzgIndex, VzgIndexEntry } from "@zugx/vzg";
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { isImeEnter, useKeys } from "../lib/keys.ts";
import { normalize } from "../lib/normalize.ts";
import SortHeader from "./SortHeader.vue";
import VzgAbbr from "./VzgAbbr.vue";

const props = defineProps<{ index: VzgIndex }>();
const route = useRoute();
const router = useRouter();

const q = ref(typeof route.query.q === "string" ? route.query.q : "");
type SortKey = "ref" | "name" | "length" | "stations" | "signals";
const SORT_KEYS: SortKey[] = ["ref", "name", "length", "stations", "signals"];
const sort = computed<SortKey>(() =>
  SORT_KEYS.includes(route.query.sort as SortKey) ? (route.query.sort as SortKey) : "ref",
);
const desc = computed(() => route.query.desc === "1");
const sel = ref(-1);

function setQuery(patch: Record<string, string | undefined>) {
  const next: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...route.query, ...patch }))
    if (typeof v === "string" && v) next[k] = v;
  void router.replace({ query: next });
}
watch(q, (v) => setQuery({ q: v || undefined }));

/** ÖBB lines by number first, then the other railways by name */
const refKey = (l: VzgIndexEntry) => (l.oebb ? l.ref! : `~${l.name ?? l.id}`);
const tokensOf = (s: string) => normalize(s).split(" ").filter(Boolean);
const rows = computed<VzgIndexEntry[]>(() => {
  const tokens = tokensOf(q.value);
  const list = props.index.lines.filter((l) => {
    if (!tokens.length) return true;
    // "10101" finds "101 01" too
    const hay = normalize(
      `${l.ref ?? ""} ${l.ref?.replace(" ", "") ?? ""} ${l.name ?? ""} ${l.operator ?? ""} ${l.from ?? ""} ${l.to ?? ""} ${l.names.join(" ")}`,
    );
    return tokens.every((tok) => hay.includes(tok));
  });
  const dir = desc.value ? -1 : 1;
  return list.sort((a, b) =>
    sort.value === "ref"
      ? dir * refKey(a).localeCompare(refKey(b))
      : sort.value === "name"
        ? dir * (a.name ?? "").localeCompare(b.name ?? "")
        : dir * (a[sort.value] - b[sort.value]),
  );
});

/** matching station names for the current query (shown under the line) */
function hits(l: VzgIndexEntry): string[] {
  const tokens = tokensOf(q.value);
  if (!tokens.length) return [];
  return l.names.filter((n) => tokens.every((t) => normalize(n).includes(t))).slice(0, 3);
}

function sortBy(k: SortKey) {
  const d = sort.value === k ? !desc.value : k !== "name" && k !== "ref";
  setQuery({ sort: k === "ref" ? undefined : k, desc: d ? "1" : undefined });
}

const open = (l?: VzgIndexEntry) => l && void router.push(`/vzg/${l.id}`);
useKeys({
  j: () => (sel.value = Math.min(rows.value.length - 1, sel.value + 1)),
  k: () => (sel.value = Math.max(0, sel.value - 1)),
  Enter: () => open(rows.value[sel.value] ?? (rows.value.length === 1 ? rows.value[0] : undefined)),
});
</script>

<template>
  <section>
    <div class="flex flex-wrap items-baseline gap-2">
      <h1 class="m-0 text-xl"><VzgAbbr :text="$t('vzg.title')" /></h1>
      <span class="muted text-sm"
        ><VzgAbbr :text="$t('vzg.subtitle', { n: index.lines.length })"
      /></span>
      <search class="contents">
        <input
          v-model="q"
          type="search"
          enterkeyhint="search"
          class="input ml-auto min-w-56 text-sm"
          :placeholder="$t('vzg.filter')"
          :aria-label="$t('vzg.filter')"
          autofocus
          @keydown.enter="(e: KeyboardEvent) => !isImeEnter(e) && open(rows[0])"
        />
      </search>
    </div>
    <p class="muted my-1 text-xs">
      {{ rows.length }} / {{ index.lines.length }} · {{ $t("vzg.asOf", { date: index.created }) }}
    </p>
    <table class="dense mt-1">
      <caption class="sr-only">
        {{ $t("vzg.title") }}
      </caption>
      <thead>
        <tr>
          <SortHeader :active="sort === 'ref'" :desc="desc" @sort="sortBy('ref')">{{
            $t("vzg.line")
          }}</SortHeader>
          <SortHeader :active="sort === 'name'" :desc="desc" @sort="sortBy('name')">{{
            $t("vzg.name")
          }}</SortHeader>
          <th scope="col" class="hide-sm">{{ $t("vzg.route") }}</th>
          <th scope="col">{{ $t("vzg.tracks") }}</th>
          <SortHeader
            class="text-right"
            :active="sort === 'length'"
            :desc="desc"
            @sort="sortBy('length')"
            >km</SortHeader
          >
          <SortHeader
            class="hide-sm text-right"
            :active="sort === 'stations'"
            :desc="desc"
            @sort="sortBy('stations')"
            >{{ $t("vzg.stations") }}</SortHeader
          >
          <SortHeader
            class="hide-sm text-right"
            :active="sort === 'signals'"
            :desc="desc"
            @sort="sortBy('signals')"
            >{{ $t("vzg.signals") }}</SortHeader
          >
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(l, i) in rows"
          :key="l.id"
          :data-row="i"
          class="cursor-pointer"
          :class="i === sel && 'sel'"
          @click="open(l)"
        >
          <td class="mono whitespace-nowrap">
            <RouterLink :to="`/vzg/${l.id}`" class="font-medium text-[var(--fg)]" @click.stop>{{
              l.oebb ? l.ref : (l.ref ?? "–")
            }}</RouterLink>
          </td>
          <td>
            {{ l.name ?? "–" }}
            <span v-if="!l.oebb && l.operator" class="muted text-xs"> · {{ l.operator }}</span>
            <div v-if="hits(l).length" class="text-xs text-[var(--warn)]">
              ⌖ {{ hits(l).join(" · ") }}
            </div>
          </td>
          <td class="hide-sm muted text-xs">
            {{ [l.from, l.to].filter(Boolean).join(" – ") }}
          </td>
          <td class="muted text-xs">
            {{ l.tracks.length > 1 ? $t("vzg.double") : $t("vzg.single") }}
            <template v-if="l.gauge && l.gauge !== '1435'"> · {{ l.gauge }} mm</template>
          </td>
          <td class="mono whitespace-nowrap text-right">
            {{ Math.round(l.length) }}
            <span class="muted text-xs">({{ l.kmFrom.toFixed(1) }}–{{ l.kmTo.toFixed(1) }})</span>
          </td>
          <td class="hide-sm mono text-right">{{ l.stations }}</td>
          <td class="hide-sm mono text-right">{{ l.signals }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
