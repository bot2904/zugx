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
/**
 * parts for the parallel PDF script: ?teil=vorne (cover and contents only), ?teil=bilder (the
 * sheets only); ?seiten=0 leaves out the page numbers (the script stamps them after merging)
 */
const part = computed(() => (typeof route.query.teil === "string" ? route.query.teil : ""));
const pageNumbers = computed(() => route.query.seiten !== "0");

const index = shallowRef<CorridorIndex>();
/** the sheets in book order: a single ÖBB number in the range, ascending */
/** every sheet with a single ÖBB number, in book order (the choice for the selection) */
const allSheets = computed(() =>
  (index.value?.corridors ?? [])
    .filter((c) => c.oebb && /^\d+$/.test(c.oebb))
    .sort((a, b) => +a.oebb! - +b.oebb! || a.id.localeCompare(b.id)),
);
/** chosen sheets (?bilder=100,101,300); none = the range von–bis */
const picked = computed(
  () =>
    new Set(
      (typeof route.query.bilder === "string" ? route.query.bilder.split(",") : []).filter(Boolean),
    ),
);
const sheets = computed(() =>
  allSheets.value.filter((c) =>
    picked.value.size ? picked.value.has(c.oebb!) : +c.oebb! >= from.value && +c.oebb! <= to.value,
  ),
);
/** the selection by hundreds (1xx, 2xx …), as the book's sections */
const groups = computed(() => {
  const m = new Map<string, typeof allSheets.value>();
  for (const c of allSheets.value) {
    const g = `${c.oebb![0]}00`;
    m.set(g, [...(m.get(g) ?? []), c]);
  }
  return [...m];
});
function setPicked(next: Set<string>) {
  const { bilder: _, ...q } = route.query;
  void router.replace({ query: next.size ? { ...q, bilder: [...next].sort().join(",") } : q });
}
function togglePick(nrs: string[]) {
  const cur = new Set(picked.value.size ? picked.value : sheets.value.map((c) => c.oebb!));
  const all = nrs.every((n) => cur.has(n));
  for (const n of nrs) {
    if (all) cur.delete(n);
    else cur.add(n);
  }
  setPicked(cur);
}
const isPicked = (nr: string) =>
  picked.value.size ? picked.value.has(nr) : sheets.value.some((c) => c.oebb === nr);
const date = computed(() => {
  const q = typeof route.query.d === "string" ? route.query.d : "";
  if (/^\d{4}-\d\d-\d\d$/.test(q)) return q;
  const i = index.value;
  const today = viennaDate();
  return i && today >= i.begin && today <= i.end ? today : (i?.day ?? today);
});

const loaded = shallowRef<Corridor[]>([]);
/** sheets still to load */
const loading = shallowRef(0);
/** sheets typeset so far (rendered one after another, so the page stays responsive) */
const shownCount = shallowRef(0);
void indexFile?.().then((m) => (index.value = m.default));
let run = 0;
watch(
  () => (part.value === "vorne" ? [] : sheets.value),
  async (list) => {
    const my = ++run;
    loaded.value = [];
    shownCount.value = 0;
    loading.value = list.length;
    // several files at once (they are separate chunks), results in book order
    const out: (Corridor | undefined)[] = Array.from({ length: list.length });
    let next = 0;
    const worker = async () => {
      while (next < list.length) {
        const i = next++;
        const f = Object.entries(files).find(([p]) => p.endsWith(`/${list[i]!.file}`))?.[1];
        out[i] = f ? (await f()).default : undefined;
        if (my === run) loading.value--;
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    if (my !== run) return;
    loaded.value = out.filter((c): c is Corridor => !!c);
    // typeset sheet by sheet: one per frame
    while (shownCount.value < loaded.value.length && my === run) {
      shownCount.value++;
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    }
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
  () =>
    part.value === "vorne" ||
    (sheets.value.length > 0 &&
      loading.value === 0 &&
      book.value.length === sheets.value.length &&
      shownCount.value >= book.value.length),
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
      <details class="pick w-full">
        <summary class="text-xs">
          {{ $t("kursbuch.pick", { n: sheets.length, total: allSheets.length }) }}
        </summary>
        <div class="mt-1 flex flex-wrap gap-1 text-xs">
          <button class="btn py-0" @click="setPicked(new Set(allSheets.map((c) => c.oebb!)))">
            {{ $t("kursbuch.pickAll") }}
          </button>
          <button class="btn py-0" @click="setPicked(new Set(['-']))">
            {{ $t("kursbuch.pickNone") }}
          </button>
        </div>
        <div class="pick-groups mt-1 text-xs">
          <fieldset v-for="[g, list] in groups" :key="g">
            <legend>
              <label>
                <input
                  type="checkbox"
                  :checked="list.every((c) => isPicked(c.oebb!))"
                  :indeterminate.prop="
                    list.some((c) => isPicked(c.oebb!)) && !list.every((c) => isPicked(c.oebb!))
                  "
                  @change="togglePick(list.map((c) => c.oebb!))"
                />
                <span class="mono">{{ g }}</span>
              </label>
            </legend>
            <label v-for="c in list" :key="c.id" class="pick-item">
              <input type="checkbox" :checked="isPicked(c.oebb!)" @change="togglePick([c.oebb!])" />
              <span class="mono">{{ c.oebb }}</span> {{ c.name }}
            </label>
          </fieldset>
        </div>
      </details>

      <p class="muted m-0 w-full text-xs">{{ $t("kursbuch.hint") }}</p>
      <!-- progress: loading the sheets, then typesetting them -->
      <div v-if="!ready && sheets.length" class="progress w-full" role="status">
        <div class="bar">
          <span
            class="load"
            :style="{ width: `${(100 * (sheets.length - loading)) / sheets.length}%` }"
          />
          <span class="set" :style="{ width: `${(100 * shownCount) / sheets.length}%` }" />
        </div>
        <span class="muted text-xs">
          <span class="spin" aria-hidden="true">⟳</span>
          {{
            loading
              ? $t("kursbuch.loading", { n: sheets.length - loading, total: sheets.length })
              : $t("kursbuch.typesetting", { n: shownCount, total: sheets.length })
          }}
        </span>
      </div>
    </div>

    <component :is="'style'" v-if="pageNumbers">
      @media print { @page { @bottom-center { content: counter(page); font-size: 8pt } } }
    </component>
    <!-- cover -->
    <div v-if="part !== 'bilder'" class="cover print-page-break">
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
    <nav
      v-if="part !== 'bilder'"
      class="toc print-page-break"
      :aria-label="$t('kursbuch.contents')"
    >
      <h2>{{ $t("kursbuch.contents") }}</h2>
      <ol>
        <li v-for="s in sheets" :key="s.id">
          <a :href="`#kb-${s.id}`"><span class="mono">{{ s.oebb }}</span> {{ s.name }}</a>
          <span class="muted"> · {{ s.km }} km</span>
        </li>
      </ol>
    </nav>

    <!-- sheets: both directions, pages of `cols` trains -->
    <section v-for="c in book.slice(0, shownCount)" :id="`kb-${c.id}`" :key="c.id" class="sheet">
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
.pick-groups {
  columns: 18rem;
  column-gap: 1rem;
}
.pick-groups fieldset {
  break-inside: avoid;
  margin: 0 0 0.5rem;
  padding: 0.25rem 0.5rem;
  border: 1px solid var(--line);
  border-radius: 0.375rem;
}
.pick-item {
  display: flex;
  gap: 0.375rem;
  align-items: baseline;
}
.pick-item input {
  flex-shrink: 0;
}
.progress {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.progress .bar {
  position: relative;
  flex: 1;
  height: 0.5rem;
  border-radius: 0.25rem;
  background: color-mix(in srgb, var(--muted) 20%, transparent);
  overflow: hidden;
}
.progress .bar span {
  position: absolute;
  inset: 0 auto 0 0;
  transition: width 0.2s;
}
.progress .load {
  background: color-mix(in srgb, var(--accent) 35%, transparent);
}
.progress .set {
  background: var(--accent);
}
.spin {
  display: inline-block;
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(1turn);
  }
}
@media (prefers-reduced-motion: reduce) {
  .spin {
    animation: none;
  }
}
</style>

<style>
/* print: A4 portrait, page numbers, no app chrome */
@media print {
  @page {
    size: A4 portrait;
    margin: 10mm 8mm 12mm;
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
