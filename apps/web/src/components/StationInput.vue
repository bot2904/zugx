<script setup lang="ts">
// Station combobox: instant local search, LocMatch fallback, recents/favourites when empty.
import type { Location } from "@zugx/hafas";
import { isImeEnter } from "../lib/keys.ts";
import { useDebounceFn } from "@vueuse/core";
import { computed, onMounted, ref, watch } from "vue";
import { api } from "../lib/api.ts";
import { loadStations, nearestStations, searchStations, type Station } from "../lib/stations.ts";
import { state, type SavedStation } from "../lib/store.ts";

const props = defineProps<{
  placeholder?: string;
  autofocus?: boolean;
  label?: string;
  id?: string;
}>();
const model = defineModel<SavedStation | undefined>();
const emit = defineEmits<{ pick: [SavedStation] }>();

const text = ref(model.value?.name ?? "");
const open = ref(false);
const sel = ref(0);
const online = ref<Location[]>([]);
const input = ref<HTMLInputElement>();
const ready = ref(false);

onMounted(async () => {
  await loadStations();
  ready.value = true;
  if (props.autofocus) input.value?.focus();
});

watch(model, (m) => {
  if (m && m.name !== text.value) text.value = m.name;
});

const local = computed<Station[]>(() =>
  ready.value && text.value ? searchStations(text.value, 8) : [],
);

type Option = { id: string; name: string; hint?: string; group: string };

const options = computed<Option[]>(() => {
  if (!text.value.trim()) {
    const fav = state.favourites.map((s) => ({ ...s, group: "favourites" }));
    const rec = state.recents
      .filter((r) => !state.favourites.some((f) => f.id === r.id))
      .map((s) => ({ ...s, group: "recents" }));
    return [...fav, ...rec];
  }
  const l = local.value.map((s) => ({
    id: s.id,
    name: s.name,
    hint: s.p?.slice(0, 4).join(" "),
    group: "local",
  }));
  const seen = new Set(l.map((x) => x.id));
  const o = online.value
    .filter((x) => !seen.has(x.id) && x.id)
    .map((x) => ({
      id: x.id,
      name: x.name,
      hint: x.type === "station" ? "" : x.type,
      group: "online",
    }));
  return [...l, ...o].slice(0, 12);
});

// online fallback only if the local index has few hits (debounced: always the latest text)
const lookupOnline = useDebounceFn(async (q: string) => {
  if (q.trim().length < 2 || local.value.length >= 5) return;
  try {
    const res = await api().locations(q, 8);
    if (q === text.value) online.value = res.filter((r) => r.type === "station");
  } catch {
    /* ignore */
  }
}, 250);
watch(text, (q) => {
  sel.value = 0;
  online.value = [];
  void lookupOnline(q);
});

function pick(o: Option) {
  const s = { id: o.id, name: o.name };
  model.value = s;
  text.value = o.name;
  open.value = false;
  emit("pick", s);
}

function onKey(e: KeyboardEvent) {
  const n = options.value.length;
  if (e.key === "ArrowDown") {
    open.value = true;
    sel.value = n ? (sel.value + 1) % n : 0;
    e.preventDefault();
  } else if (e.key === "ArrowUp") {
    sel.value = n ? (sel.value - 1 + n) % n : 0;
    e.preventDefault();
  } else if (e.key === "Enter" && !isImeEnter(e)) {
    const o = options.value[sel.value];
    if (o && open.value) {
      pick(o);
      e.preventDefault();
    }
  } else if (e.key === "Escape") {
    open.value = false;
  } else {
    open.value = true;
  }
}

function onBlur() {
  setTimeout(() => (open.value = false), 150);
}

function nearMe() {
  navigator.geolocation?.getCurrentPosition((p) => {
    const n = nearestStations(p.coords.latitude, p.coords.longitude, 1)[0];
    if (n) pick({ id: n.id, name: n.name, group: "nearby" });
  });
}

defineExpose({ focus: () => input.value?.focus() });
</script>

<template>
  <div class="relative">
    <label v-if="label" :for="id" class="muted mb-0.5 block text-xs">{{ label }}</label>
    <div class="flex">
      <input
        :id="id"
        ref="input"
        v-model="text"
        class="input w-full"
        :placeholder="placeholder ?? $t('search.placeholder')"
        role="combobox"
        autocomplete="off"
        spellcheck="false"
        :aria-expanded="open"
        @focus="open = true"
        @blur="onBlur"
        @keydown="onKey"
      />
      <button
        class="btn ml-1"
        type="button"
        :title="$t('search.nearby')"
        :aria-label="$t('search.nearby')"
        @click="nearMe"
      >
        ⌖
      </button>
    </div>
    <ul
      v-if="open && options.length"
      class="card absolute z-20 mt-1 max-h-80 w-full list-none overflow-auto p-0 shadow-lg"
      role="listbox"
    >
      <li
        v-for="(o, i) in options"
        :key="o.group + o.id"
        role="option"
        :aria-selected="i === sel"
        class="flex cursor-pointer items-center gap-2 px-2 py-1"
        :class="i === sel && 'bg-[var(--bg3)]'"
        @mousedown.prevent="pick(o)"
        @mouseenter="sel = i"
      >
        <span v-if="o.group === 'favourites'" class="text-[var(--warn)]">★</span>
        <span v-else-if="o.group === 'recents'" class="muted">↺</span>
        <span v-else-if="o.group === 'online'" class="muted" :title="$t('search.online')">⌁</span>
        <span>{{ o.name }}</span>
        <span class="muted ml-auto text-xs mono">{{ o.hint }}</span>
      </li>
    </ul>
  </div>
</template>
