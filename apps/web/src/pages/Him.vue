<script setup lang="ts">
import type { Warning } from "@zugx/hafas";
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import Status from "../components/Status.vue";
import { api } from "../lib/api.ts";
import { useAsync } from "../lib/async.ts";

/**
 * kinds of message (HIM categories, as the ÖBB journey planner's filter): construction work
 * dominates, so it is fetched separately — one request would fill its limit with construction
 */
const KINDS = [
  { id: "stoerung", cats: [5] },
  { id: "behoben", cats: [6] },
  { id: "ausfall", cats: [2] },
  { id: "baustelle", cats: [1] },
  { id: "sev", cats: [0] },
  { id: "info", cats: [3, 4, 7] },
] as const;
type KindId = (typeof KINDS)[number]["id"];
const kindOf = (w: Warning): KindId =>
  KINDS.find((k) => (k.cats as readonly number[]).includes(w.kind ?? 4))?.id ?? "info";

const msgs = useAsync<Warning[]>(async () => {
  const [other, construction] = await Promise.all([
    api().warnings(500, [0, 2, 3, 4, 5, 6, 7]),
    api().warnings(500, [1]),
  ]);
  const seen = new Set<string>();
  return [...other, ...construction].filter((w) => !seen.has(w.id) && !!seen.add(w.id));
});
onMounted(msgs.run);
const q = ref("");

// selected kinds, in the address (?typ=stoerung,ausfall); none = all
const route = useRoute();
const router = useRouter();
const selected = computed(
  () =>
    new Set(
      (typeof route.query.typ === "string" ? route.query.typ.split(",") : []).filter((k) =>
        KINDS.some((x) => x.id === k),
      ),
    ),
);
function toggleKind(k: KindId | "all") {
  const next = new Set(selected.value);
  if (k === "all") next.clear();
  else if (next.has(k)) next.delete(k);
  else next.add(k);
  const { typ: _, ...rest } = route.query;
  void router.replace({ query: next.size ? { ...rest, typ: [...next].join(",") } : rest });
}
const counts = computed(() => {
  const c: Record<string, number> = {};
  for (const w of msgs.data.value ?? []) c[kindOf(w)] = (c[kindOf(w)] ?? 0) + 1;
  return c;
});
const shown = computed(() => {
  const s = q.value.toLowerCase();
  return (msgs.data.value ?? [])
    .filter((m) => !selected.value.size || selected.value.has(kindOf(m)))
    .filter(
      (m) =>
        !s ||
        `${m.title} ${m.text} ${m.affectedFrom?.name ?? ""} ${m.affectedTo?.name ?? ""}`
          .toLowerCase()
          .includes(s),
    )
    .sort((a, b) => (b.modified ?? "").localeCompare(a.modified ?? ""));
});
const d = (iso?: string) =>
  iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}. ${iso.slice(11, 16)}` : "";
</script>

<template>
  <section>
    <div class="flex items-center gap-2">
      <h1 class="m-0 text-xl">{{ $t("him.title") }}</h1>
      <span class="muted text-xs">{{ shown.length }}</span>
      <search class="contents">
        <input
          v-model="q"
          type="search"
          enterkeyhint="search"
          class="input ml-auto"
          :placeholder="$t('him.filter')"
          :aria-label="$t('him.filter')"
        />
      </search>
    </div>
    <div class="my-2 flex flex-wrap gap-1 text-xs" role="group" :aria-label="$t('him.kinds')">
      <button
        class="btn chip"
        :class="!selected.size && 'btn-on'"
        :aria-pressed="!selected.size"
        @click="toggleKind('all')"
      >
        {{ $t("him.kind.all") }}
        <span class="muted mono">{{ msgs.data.value?.length ?? "" }}</span>
      </button>
      <button
        v-for="k in KINDS"
        :key="k.id"
        class="btn chip"
        :class="selected.has(k.id) && 'btn-on'"
        :aria-pressed="selected.has(k.id)"
        @click="toggleKind(k.id)"
      >
        <span class="kind-dot" :class="`k-${k.id}`" aria-hidden="true" />
        {{ $t(`him.kind.${k.id}`) }}
        <span class="muted mono">{{ counts[k.id] ?? 0 }}</span>
      </button>
    </div>
    <Status :loading="msgs.loading.value" :error="msgs.error.value" @retry="msgs.run" />
    <article
      v-for="(m, i) in shown"
      :key="m.id"
      class="card my-2 p-3"
      :class="i >= 8 && 'defer-render'"
    >
      <div class="flex flex-wrap items-baseline gap-2">
        <span class="kind-label text-xs" :class="`k-${kindOf(m)}`">{{
          $t(`him.kind.${kindOf(m)}`)
        }}</span>
        <b>{{ m.title }}</b>
        <span v-if="m.affectedFrom" class="text-sm">
          {{ m.affectedFrom.name
          }}<template v-if="m.affectedTo && m.affectedTo.id !== m.affectedFrom.id">
            – {{ m.affectedTo.name }}</template
          >
        </span>
        <span class="muted mono ml-auto text-xs"
          >{{ $t("him.valid") }} {{ d(m.validFrom) }} – {{ d(m.validUntil) }}</span
        >
      </div>
      <p class="m-0 mt-1 whitespace-pre-line text-sm">{{ m.text }}</p>
    </article>
    <p v-if="msgs.data.value && !shown.length" class="muted">{{ $t("him.empty") }}</p>
  </section>
</template>

<style scoped>
/* kind of message: a coloured dot on the filter chips, a label on each message */
.kind-dot {
  display: inline-block;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: currentColor;
}
.kind-label {
  padding: 0 0.375rem;
  border-radius: 0.25rem;
  border: 1px solid currentColor;
}
.k-stoerung {
  color: var(--bad);
}
.k-behoben {
  color: var(--good);
}
.k-ausfall {
  color: var(--bad);
}
.k-baustelle {
  color: var(--warn);
}
.k-sev {
  color: var(--link);
}
.k-info {
  color: var(--muted);
}
</style>
