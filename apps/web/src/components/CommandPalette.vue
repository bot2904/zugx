<script setup lang="ts">
// Ctrl+K palette: pages, stations (→ board), train numbers (→ train page).
import { isImeEnter } from "../lib/keys.ts";
import { computed, nextTick, ref, shallowRef, watch } from "vue";
import ModalDialog from "./ModalDialog.vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { normalize } from "../lib/normalize.ts";
import { loadStations, searchStations } from "../lib/stations.ts";
import { loadTrains, yearFor, type TrainIndex } from "../lib/trains.ts";
import { state } from "../lib/store.ts";
import { scheme, toggleScheme } from "../lib/theme.ts";
import { trainSlug } from "../lib/url.ts";

const open = defineModel<boolean>({ default: false });
const { t } = useI18n();
const router = useRouter();
const q = ref("");
const sel = ref(0);
const input = ref<HTMLInputElement>();
const trains = shallowRef<TrainIndex>();

watch(open, async (o) => {
  if (o) {
    q.value = "";
    sel.value = 0;
    await loadStations();
    const y = yearFor(new Date().toISOString().slice(0, 10));
    if (y && !trains.value) void loadTrains(y, false).then((t) => (trains.value = t));
    await nextTick();
    input.value?.focus();
  }
});

interface Cmd {
  label: string;
  hint?: string;
  run: () => void;
}

const TRAIN_RE = /^\s*([a-z]{1,4})?\s*(\d{1,6})\s*$/i;

const commands = computed<Cmd[]>(() => {
  const pages: Cmd[] = [
    { label: t("nav.search"), hint: "/", run: () => router.push("/") },
    { label: t("nav.trains"), hint: "/trains", run: () => router.push("/trains") },
    { label: t("nav.radar"), hint: "/radar", run: () => router.push("/radar") },
    { label: t("nav.bildfahrplan"), hint: "/bf", run: () => router.push("/bf") },
    { label: t("nav.netz"), hint: "/netz", run: () => router.push("/netz") },
    { label: t("nav.him"), hint: "/him", run: () => router.push("/him") },
    { label: t("debug.show"), hint: "d", run: () => (state.debug = !state.debug) },
    {
      label: `${t("common.theme")}: ${scheme.value === "dark" ? "light" : "dark"}`,
      run: toggleScheme,
    },
  ];
  const query = q.value.trim().toLowerCase();
  if (!query) return pages;
  const out: Cmd[] = [];
  const m = TRAIN_RE.exec(q.value);
  if (m) {
    const name = `${(m[1] ?? "").toUpperCase()} ${m[2]}`.trim();
    out.push({
      label: `🚆 ${name}`,
      hint: t("trip.title"),
      run: () => router.push(`/train/${trainSlug(name)}`),
    });
  }
  out.push(...pages.filter((p) => p.label.toLowerCase().includes(query)));
  if (query.length >= 3 && trains.value) {
    const nq = normalize(query);
    for (const x of trains.value.trains
      .filter((x) => x.name && normalize(x.name).includes(nq))
      .slice(0, 6)) {
      const name = `${x.cat} ${x.nr}`;
      out.push({
        label: `🚆 ${name} »${x.name}«`,
        hint: t("trip.title"),
        run: () => router.push(`/train/${trainSlug(name)}`),
      });
    }
  }
  for (const s of searchStations(q.value, 8)) {
    out.push({
      label: s.name,
      hint: t("search.board"),
      run: () => router.push(`/station/${s.id}`),
    });
  }
  return out;
});

function onKey(e: KeyboardEvent) {
  const n = commands.value.length;
  if (e.key === "ArrowDown") {
    sel.value = (sel.value + 1) % n;
    e.preventDefault();
  } else if (e.key === "ArrowUp") {
    sel.value = (sel.value - 1 + n) % n;
    e.preventDefault();
  } else if (e.key === "Enter" && !isImeEnter(e)) {
    commands.value[sel.value]?.run();
    open.value = false;
  }
}
watch(q, () => (sel.value = 0));
</script>

<template>
  <ModalDialog v-model="open" :label="$t('common.commandPalette')">
    <input
      ref="input"
      v-model="q"
      autofocus
      class="input w-full text-base"
      :placeholder="`${$t('search.placeholder')} · ${$t('search.trainHint')}`"
      :aria-label="`${$t('search.placeholder')} · ${$t('search.trainHint')}`"
      @keydown="onKey"
    />
    <ul class="m-0 mt-2 max-h-[50vh] list-none overflow-auto p-0">
      <li
        v-for="(c, i) in commands"
        :key="i"
        class="flex cursor-pointer gap-2 rounded px-2 py-1"
        :class="i === sel && 'bg-[var(--bg3)]'"
        @mouseenter="sel = i"
        @click="
          c.run();
          open = false;
        "
      >
        <span>{{ c.label }}</span><span class="muted ml-auto text-xs mono">{{ c.hint }}</span>
      </li>
    </ul>
  </ModalDialog>
</template>
