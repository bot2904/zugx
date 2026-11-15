<script setup lang="ts">
// Planning panel "Fahrzeitreserve" (PLAN.md "Bildfahrplan as a planning tool", item 8): scheduled
// running time between consecutive stops vs. the minimum at the permitted speed (VzG, capped at
// the category's top speed). Large reserves = room for faster trains (or time kept for
// connections); small ones = tight, every disturbance shows. Over the whole day.
import type { CorridorStation } from "@zugx/netz";
import { computed, ref } from "vue";
import LineBadge from "./LineBadge.vue";
import { reserveClass, type ReserveRow } from "../lib/bf-plan.ts";

const props = defineProps<{
  stations: CorridorStation[];
  rows: ReserveRow[];
  /** display direction: rows of this direction first */
  dir: 1 | -1;
}>();

const dirShown = ref<1 | -1>(props.dir);
const all = ref(false);
const shown = computed(() =>
  props.rows
    .filter((r) => r.dir === dirShown.value && (all.value || r.n >= 3))
    .sort((a, b) => (a.from - b.from) * dirShown.value || a.to - b.to || b.n - a.n),
);
/** per category over the shown direction: Σ planned vs Σ minimum (weighted by trains) */
const perCat = computed(() => {
  const m = new Map<string, { p: number; min: number }>();
  for (const r of shown.value) {
    const x = m.get(r.cat) ?? { p: 0, min: 0 };
    x.p += r.planned * r.n;
    x.min += r.min * r.n;
    m.set(r.cat, x);
  }
  return [...m].map(([cat, x]) => ({ cat, pct: Math.round(((x.p - x.min) / x.min) * 100) }));
});
const fmt = (v: number) => (Math.round(v * 10) / 10).toLocaleString(undefined);
const pct = (r: ReserveRow) => Math.round(((r.planned - r.min) / r.min) * 100);
</script>

<template>
  <section class="card bf-plan mt-2 p-2 text-xs">
    <div class="mb-2 flex flex-wrap items-center gap-2">
      <strong>{{ $t("bf.plan.reserve") }}</strong>
      <span class="flex gap-1">
        <button
          v-for="d in [1, -1] as const"
          :key="d"
          class="btn py-0"
          :class="dirShown === d && 'btn-on'"
          @click="dirShown = d"
        >
          → {{ d === 1 ? stations.at(-1)?.name : stations[0]?.name }}
        </button>
      </span>
      <span v-if="perCat.length" class="muted">
        {{ $t("bf.plan.reservePerCat") }}:
        <template v-for="(c, k) in perCat" :key="c.cat"
          ><template v-if="k"> · </template>{{ c.cat }} {{ c.pct }} %</template
        >
      </span>
    </div>
    <p v-if="!shown.length" class="muted m-0">{{ $t("bf.plan.noReserve") }}</p>
    <div v-else class="overflow-x-auto">
      <table class="plan-table">
        <thead>
          <tr>
            <th>{{ $t("bf.plan.stretch") }}</th>
            <th>{{ $t("bf.plan.line") }}</th>
            <th class="num">{{ $t("bf.plan.trains") }}</th>
            <th class="num">{{ $t("bf.plan.planned") }}</th>
            <th class="num">{{ $t("bf.plan.minimum") }}</th>
            <th class="num">{{ $t("bf.plan.buffer") }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in shown" :key="`${r.from}|${r.to}|${r.cat}`">
            <td>{{ stations[r.from]?.name }} – {{ stations[r.to]?.name }}</td>
            <td><LineBadge :cat="r.cat" small /></td>
            <td class="num mono">{{ r.n }}</td>
            <td class="num mono">{{ fmt(r.planned) }}′</td>
            <td class="num mono">{{ fmt(r.min) }}′</td>
            <td class="num mono">
              <span
                class="res"
                :class="reserveClass(r.planned, r.min)"
                v-tip="r.planned < r.min ? $t('bf.plan.negTip') : undefined"
                >{{ fmt(r.planned - r.min) }}′ · {{ pct(r) }} %</span
              >
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <button
      v-if="rows.some((r) => r.dir === dirShown && r.n < 3)"
      class="btn mt-1 py-0 text-xs"
      @click="all = !all"
    >
      {{ all ? $t("bf.plan.regularLines") : $t("bf.plan.allStretches") }}
    </button>
    <p class="muted m-0 mt-2">{{ $t("bf.plan.reserveNote") }}</p>
  </section>
</template>

<style scoped>
.plan-table {
  border-collapse: collapse;
}
.plan-table th,
.plan-table td {
  padding: 0.125rem 0.5rem;
  text-align: left;
  white-space: nowrap;
}
.plan-table th {
  font-weight: 600;
  border-bottom: 1px solid var(--line);
}
.plan-table .num {
  text-align: right;
}
.plan-table tbody tr:nth-child(even) {
  background: var(--bg);
}
.res {
  font-weight: 600;
}
.good {
  color: var(--good);
}
.mid {
  color: var(--warn);
}
.slack {
  color: var(--link);
}
.neg {
  color: var(--muted);
  font-weight: 400;
  font-style: italic;
}
</style>
