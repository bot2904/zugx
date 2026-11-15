<script setup lang="ts">
// The timetable book (Kursbuch) for one day, ready to print as PDF: cover, contents, then every
// timetable sheet (ÖBB Fahrplanbild number, from 100 on) in the Kursbuch layout — both directions,
// pages of a fixed number of train columns, A4 portrait with page numbers. Print from the browser
// ("PDF") or headless: `vp run kursbuch:pdf`. ?d=YYYY-MM-DD, ?von=100&bis=199, ?cols=12.
import type { Corridor, CorridorIndex, CorridorTrain } from "@zugx/netz";
import { computed, shallowRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import BfBook from "../components/BfBook.vue";
import { useI18n } from "../i18n/index.ts";
import { daysBetween, viennaDate } from "../lib/format.ts";
import { usePageTitle } from "../lib/title.ts";

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const files = import.meta.glob<{ default: Corridor }>(
  "../../../../packages/netz/data/corridors/*.toml",
);
const indexFile = Object.entries(files).find(([p]) => p.endsWith("/index.toml"))?.[1] as
  | (() => Promise<{ default: CorridorIndex }>)
  | undefined;

const num = (k: string, d: number) => {
  const v = Number(route.query[k]);
  return Number.isFinite(v) && v > 0 ? v : d;
};
const from = computed(() => num("von", 100));
const to = computed(() => num("bis", 999));
const cols = computed(() => num("cols", 12));

const index = shallowRef<CorridorIndex>();
/** the sheets in book order: a single ÖBB number in the range, ascending */
const sheets = computed(() =>
  (index.value?.corridors ?? [])
    .filter((c) => c.oebb && /^\d+$/.test(c.oebb) && +c.oebb >= from.value && +c.oebb <= to.value)
    .sort((a, b) => +a.oebb! - +b.oebb! || a.id.localeCompare(b.id)),
);
const date = computed(() => {
  const q = typeof route.query.d === "string" ? route.query.d : "";
  if (/^\d{4}-\d\d-\d\d$/.test(q)) return q;
  const i = index.value;
  const today = viennaDate();
  return i && today >= i.begin && today <= i.end ? today : (i?.day ?? today);
});

const loaded = shallowRef<Corridor[]>([]);
const loading = shallowRef(0);
void indexFile?.().then((m) => (index.value = m.default));
watch(
  sheets,
  async (list) => {
    loaded.value = [];
    loading.value = list.length;
    const out: Corridor[] = [];
    for (const s of list) {
      const f = Object.entries(files).find(([p]) => p.endsWith(`/${s.file}`))?.[1];
      if (f) out.push((await f()).default);
      loading.value--;
    }
    loaded.value = out;
  },
  { immediate: true },
);

function trainsOn(c: Corridor): CorridorTrain[] {
  const i = c.begin ? daysBetween(c.begin, date.value) : -1;
  return c.trains.filter((tr) => {
    if (!tr.days) return true;
    const b = atob(tr.days).charCodeAt(i >> 3);
    return i >= 0 && ((b >> (7 - (i & 7))) & 1) === 1;
  });
}
const book = computed(() =>
  loaded.value.map((c) => {
    const ref = sheets.value.find((s) => s.file.replace(/\.toml$/, "") === c.id || s.id === c.id);
    const stations = c.stations.map((s, i) => ({ ...s, i }));
    return {
      id: c.id,
      oebb: ref?.oebb ?? c.id,
      name: ref?.name ?? c.name,
      stations,
      reverse: [...stations].reverse(),
      trains: trainsOn(c),
    };
  }),
);
const dateLong = computed(() =>
  Temporal.PlainDate.from(date.value).toLocaleString(locale.value, { dateStyle: "full" }),
);
/** everything loaded and rendered (the PDF script waits for data-ready) */
const ready = computed(
  () => sheets.value.length > 0 && loading.value === 0 && book.value.length === sheets.value.length,
);
const setQuery = (q: Record<string, string | undefined>) =>
  void router.replace({ query: { ...route.query, ...q } });
const print = () => window.print();

usePageTitle(() => [t("kursbuch.title"), date.value]);
</script>

<template>
  <section class="kursbuch" :data-ready="ready || undefined">
    <div class="no-print mb-3 flex flex-wrap items-center gap-2 text-sm">
      <h1 class="m-0 text-xl">{{ $t("kursbuch.title") }}</h1>
      <input
        type="date"
        class="input text-xs"
        :value="date"
        :min="index?.begin"
        :max="index?.end"
        :aria-label="$t('trains.runsOn')"
        @change="setQuery({ d: ($event.target as HTMLInputElement).value || undefined })"
      />
      <label class="flex items-center gap-1 text-xs">
        {{ $t("kursbuch.sheets") }}
        <input
          type="number"
          class="input w-16 text-xs"
          :value="from"
          min="100"
          max="999"
          @change="setQuery({ von: ($event.target as HTMLInputElement).value })"
        />
        –
        <input
          type="number"
          class="input w-16 text-xs"
          :value="to"
          min="100"
          max="999"
          @change="setQuery({ bis: ($event.target as HTMLInputElement).value })"
        />
      </label>
      <label class="flex items-center gap-1 text-xs">
        {{ $t("kursbuch.cols") }}
        <input
          type="number"
          class="input w-14 text-xs"
          :value="cols"
          min="4"
          max="30"
          @change="setQuery({ cols: ($event.target as HTMLInputElement).value })"
        />
      </label>
      <button class="btn" :disabled="!ready" @click="print">⎙ {{ $t("kursbuch.print") }}</button>
      <span v-if="loading" class="muted text-xs" role="status">
        {{ $t("kursbuch.loading", { n: loading }) }}
      </span>
      <p class="muted m-0 w-full text-xs">{{ $t("kursbuch.hint") }}</p>
    </div>

    <!-- cover -->
    <div class="cover print-page-break">
      <p class="cover-kicker">zugx</p>
      <h1 class="cover-title">{{ $t("kursbuch.title") }}</h1>
      <p class="cover-sub">
        {{
          $t("kursbuch.cover", {
            date: dateLong,
            from,
            to: Math.min(to, 999),
          })
        }}
      </p>
      <p class="muted cover-source">{{ index?.source }} · {{ $t("kursbuch.coverNote") }}</p>
    </div>

    <!-- contents -->
    <nav class="toc print-page-break" :aria-label="$t('kursbuch.contents')">
      <h2>{{ $t("kursbuch.contents") }}</h2>
      <ol>
        <li v-for="s in sheets" :key="s.id">
          <a :href="`#kb-${s.id}`"><span class="mono">{{ s.oebb }}</span> {{ s.name }}</a>
          <span class="muted"> · {{ s.km }} km</span>
        </li>
      </ol>
    </nav>

    <!-- sheets: both directions, pages of `cols` trains -->
    <section v-for="c in book" :id="`kb-${c.id}`" :key="c.id" class="sheet">
      <BfBook
        v-for="dir in [1, -1] as const"
        :key="dir"
        :stations="dir === 1 ? c.stations : c.reverse"
        :trains="c.trains"
        :dir="dir"
        :t0="0"
        :t1="30 * 60"
        :date="date"
        :per-page="cols"
        :title="`${c.oebb} · ${c.name}`"
      />
    </section>
  </section>
</template>

<style scoped>
.cover {
  min-height: 60vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.5rem;
}
.cover-kicker {
  margin: 0;
  font:
    700 1.25rem ui-monospace,
    monospace;
  color: var(--accent);
}
.cover-title {
  margin: 0;
  font-size: 3rem;
}
.cover-sub {
  margin: 0;
  font-size: 1.125rem;
}
.toc ol {
  columns: 2;
  padding-left: 0;
  list-style: none;
  font-size: 0.8125rem;
}
.toc a {
  color: inherit;
}
.sheet {
  margin-top: 1rem;
}
</style>

<style>
/* print: A4 portrait, page numbers, no app chrome */
@media print {
  @page {
    size: A4 portrait;
    margin: 10mm 8mm 12mm;
    @bottom-center {
      content: counter(page);
      font-size: 8pt;
    }
  }
  header,
  footer,
  .no-print {
    display: none !important;
  }
  html,
  body {
    background: #fff !important;
  }
  main#main {
    max-width: none !important;
    padding: 0 !important;
  }
  .kursbuch .print-page-break {
    break-after: page;
  }
  /* every sheet starts on a new page */
  .kursbuch .sheet + .sheet {
    break-before: page;
  }
  .kursbuch .bf-book.printed table {
    font-size: 6.5pt;
  }
}
</style>
