<script setup lang="ts">
// Station index: every rail station of the timetable, A–Z, with the ÖBB operating-point
// abbreviation (Betriebsstellen-Kürzel, from OSM railway:ref) and the categories stopping there.
// Filter by name or abbreviation ("Kt", "Vb", "Vps"); an exact abbreviation comes first.
// A station opens its departure plan (timetable, GTFS); without one, the live board.
import abbrData from "@zugx/stations/abbr.toml";
import { computed, shallowRef } from "vue";
import { useRoute, useRouter } from "vue-router";
import LineBadge from "../components/LineBadge.vue";
import { useI18n } from "../i18n/index.ts";
import { normalize } from "../lib/normalize.ts";
import { loadStations, type Station } from "../lib/stations.ts";
import { usePageTitle } from "../lib/title.ts";

const { t } = useI18n();
const ABBR = abbrData as unknown as Record<string, string>;
/** stations with a departure plan (the files are loaded only when opened) */
const POSTERS = new Set(
  Object.keys(import.meta.glob("../../../../packages/trains/data/departures/*.toml")).map(
    (p) => /([^/]+)\.toml$/.exec(p)?.[1],
  ),
);

const list = shallowRef<Station[]>([]);
void loadStations().then((ix) => {
  list.value = ix.map((x) => x.s).sort((a, b) => a.name.localeCompare(b.name, "de"));
});
const route = useRoute();
const router = useRouter();
/** filter, kept in the address (?q=Kt) */
const q = computed({
  get: () => (typeof route.query.q === "string" ? route.query.q : ""),
  set: (v: string) => void router.replace({ query: v ? { q: v } : {} }),
});

/** "Kitzbühel" instead of "Kitzbühel Bahnhof" */
const short = (n: string) => n.replace(/\s+(Bahnhof|Bahnhst|Bhf)$/, "");
const shown = computed(() => {
  const raw = q.value.trim();
  if (!raw) return list.value;
  const n = normalize(raw);
  const lower = raw.toLowerCase();
  const hits = list.value.filter(
    (s) => ABBR[s.id]?.toLowerCase().startsWith(lower) || normalize(s.name).includes(n),
  );
  // exact abbreviation first, then abbreviation prefix, then name
  const rank = (s: Station) => {
    const a = ABBR[s.id]?.toLowerCase();
    return a === lower ? 0 : a?.startsWith(lower) ? 1 : 2;
  };
  return hits.sort((a, b) => rank(a) - rank(b));
});
const letters = computed(() => {
  const m = new Map<string, Station[]>();
  for (const s of shown.value) {
    const l = q.value.trim() ? "" : (s.name[0] ?? "").toUpperCase();
    m.set(l, [...(m.get(l) ?? []), s]);
  }
  return [...m];
});
const link = (s: Station) => (POSTERS.has(s.id) ? `/station/${s.id}/plan` : `/station/${s.id}`);

usePageTitle(() => [t("stations.title")]);
</script>

<template>
  <section>
    <div class="mb-2 flex flex-wrap items-center gap-2">
      <h1 class="m-0 text-xl">{{ $t("stations.title") }}</h1>
      <span class="muted text-sm">{{ $t("stations.count", { n: shown.length }) }}</span>
      <input
        v-model="q"
        type="search"
        class="input ml-auto w-64 text-sm"
        :placeholder="$t('stations.filter')"
        :aria-label="$t('stations.filter')"
      />
    </div>
    <nav v-if="!q.trim()" class="letters mb-2 flex flex-wrap gap-1 text-sm" aria-label="A–Z">
      <a v-for="[l] in letters" :key="l" :href="`#l-${l}`" class="mono">{{ l }}</a>
    </nav>
    <p class="muted mt-0 text-xs">{{ $t("stations.note") }}</p>
    <section v-for="[l, ss] in letters" :key="l" class="mb-3">
      <h2 v-if="l" :id="`l-${l}`" class="m-0 mb-1 text-base">{{ l }}</h2>
      <ul class="cols m-0 list-none p-0">
        <li v-for="s in ss" :key="s.id" class="row">
          <span class="abbr mono" :class="!ABBR[s.id] && 'none'">{{ ABBR[s.id] ?? "" }}</span>
          <RouterLink :to="link(s)" class="name">{{ short(s.name) }}</RouterLink>
          <span class="cats">
            <LineBadge v-for="c in (s.p ?? []).slice(0, 4)" :key="c" :cat="c" small />
          </span>
        </li>
      </ul>
    </section>
  </section>
</template>

<style scoped>
.cols {
  column-width: 22rem;
  column-gap: 1.5rem;
}
.row {
  display: grid;
  grid-template-columns: 3.75rem 1fr auto;
  gap: 0.5rem;
  align-items: baseline;
  padding: 0.125rem 0;
  break-inside: avoid;
  font-size: 0.875rem;
}
.abbr {
  white-space: nowrap;
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 600;
}
.cats {
  display: inline-flex;
  gap: 0.125rem;
}
.letters a {
  padding: 0 0.25rem;
}
</style>
