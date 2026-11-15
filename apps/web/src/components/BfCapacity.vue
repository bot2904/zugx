<script setup lang="ts">
// Planning panel "Kapazität": blocking times per block section (Sperrzeitentreppe) — how much
// of the time window each block is blocked, the longest blocking time (≈ minimum headway) and
// conflicts. Blocks from the main signals in OSM; the boxes are drawn in the chart.
import type { CorridorStation } from "@zugx/netz";
import { useLocalStorage } from "@vueuse/core";
import { computed, ref } from "vue";
import {
  BLOCK_DEFAULTS,
  occupancyClass,
  type BlockParams,
  type BlockRow,
} from "../lib/bf-capacity.ts";

const props = defineProps<{
  stations: CorridorStation[];
  rows: BlockRow[];
  /** display direction (rows of this direction first) */
  dir: 1 | -1;
  /** km covered by signal data / total, for the note */
  coverage: number;
}>();
const params = defineModel<BlockParams>("params", { default: () => ({ ...BLOCK_DEFAULTS }) });
const set = (k: keyof BlockParams, v: string) => {
  const n = Number(v.replace(",", "."));
  if (Number.isFinite(n) && n >= 0) params.value = { ...params.value, [k]: n };
};
const FIELDS: { k: keyof BlockParams; step: number; unit: string }[] = [
  { k: "approach", step: 50, unit: "m" },
  { k: "setup", step: 0.1, unit: "min" },
  { k: "release", step: 0.05, unit: "min" },
  { k: "lengthMU", step: 10, unit: "m" },
  { k: "lengthLoco", step: 10, unit: "m" },
  { k: "tolerance", step: 0.1, unit: "min" },
];
const changed = computed(() => FIELDS.some(({ k }) => params.value[k] !== BLOCK_DEFAULTS[k]));

const dirShown = ref<1 | -1>(props.dir);
const onlyTight = useLocalStorage("zugx:bf-capacity-tight", false);
const shown = computed(() =>
  props.rows
    .filter((r) => r.dir === dirShown.value)
    .filter((r) => !onlyTight.value || r.occupancy > 0.6 || r.conflicts > 0),
);
const all = computed(() => props.rows.filter((r) => r.dir === dirShown.value));
const bottleneck = computed(() =>
  all.value.reduce<BlockRow | undefined>(
    (b, r) => (!b || r.occupancy > b.occupancy ? r : b),
    undefined,
  ),
);
const conflicts = computed(() => all.value.reduce((s, r) => s + r.conflicts, 0));
const mean = computed(() =>
  all.value.length ? all.value.reduce((s, r) => s + r.occupancy, 0) / all.value.length : 0,
);

/** the stations around a block, in travel order: "A – B" */
function between(r: BlockRow) {
  const st = props.stations;
  const before = st.findLast((s) => s.km <= r.from + 0.05);
  const after = st.find((s) => s.km >= r.to - 0.05);
  const [a, b] = r.dir === 1 ? [before, after] : [after, before];
  if (a && b && a === b) return a.name;
  return [a?.name, b?.name].filter(Boolean).join(" – ");
}
/** always one decimal (aligned columns): 163,0 not 163 */
const km = (v: number) =>
  v.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct = (v: number) => `${Math.round(v * 100)} %`;
</script>

<template>
  <section class="card bf-plan mt-2 p-2 text-xs">
    <div class="mb-2 flex flex-wrap items-center gap-2">
      <strong>{{ $t("bf.plan.capacity") }}</strong>
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
      <label class="flex items-center gap-1">
        <input v-model="onlyTight" type="checkbox" />
        {{ $t("bf.plan.onlyTight") }}
      </label>
    </div>
    <p v-if="bottleneck" class="m-0 mb-2">
      {{
        $t("bf.plan.capacitySummary", {
          blocks: all.length,
          mean: pct(mean),
          conflicts,
        })
      }}
      <template v-if="bottleneck.occupancy > 0">
        ·
        <strong>{{ $t("bf.plan.bottleneck") }}:</strong>
        {{ between(bottleneck) }} (km {{ km(bottleneck.from) }}–{{ km(bottleneck.to) }})
        <span class="occ" :class="occupancyClass(bottleneck.occupancy)">{{
          pct(bottleneck.occupancy)
        }}</span>
      </template>
    </p>

    <fieldset class="params mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
      <legend class="muted">{{ $t("bf.plan.assumptions") }}</legend>
      <label v-for="f in FIELDS" :key="f.k" class="flex items-center gap-1">
        {{ $t(`bf.plan.block.${f.k}`) }}
        <input
          type="number"
          class="input w-16 text-xs"
          :step="f.step"
          min="0"
          :value="params[f.k]"
          @change="set(f.k, ($event.target as HTMLInputElement).value)"
        />
        <span class="muted">{{ f.unit }}</span>
      </label>
      <button v-if="changed" class="btn py-0" @click="params = { ...BLOCK_DEFAULTS }">
        {{ $t("bf.plan.resetParams") }}
      </button>
    </fieldset>

    <p v-if="!shown.length" class="muted m-0">{{ $t("bf.plan.noBlocks") }}</p>
    <div v-else class="overflow-x-auto">
      <table class="plan-table">
        <thead>
          <tr>
            <th class="num">#</th>
            <th>{{ $t("bf.plan.stretch") }}</th>
            <th class="num">km</th>
            <th class="num">{{ $t("bf.plan.blockLength") }}</th>
            <th class="num">{{ $t("bf.plan.trains") }}</th>
            <th>{{ $t("bf.plan.occupancy") }}</th>
            <th class="num">{{ $t("bf.plan.maxBlock") }}</th>
            <th class="num">{{ $t("bf.plan.conflicts") }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in shown" :key="`${r.dir}|${r.block}`" :class="r.conflicts > 0 && 'conf'">
            <td class="num mono muted">{{ r.block + 1 }}</td>
            <td>{{ between(r) }}</td>
            <td class="num mono">{{ km(r.from) }}–{{ km(r.to) }}</td>
            <td class="num mono">{{ km(r.to - r.from) }}</td>
            <td class="num mono">{{ r.n }}</td>
            <td>
              <span class="bar" :class="occupancyClass(r.occupancy)">
                <span :style="{ width: `${Math.min(100, r.occupancy * 100)}%` }" />
              </span>
              <span class="occ mono" :class="occupancyClass(r.occupancy)">{{
                pct(r.occupancy)
              }}</span>
            </td>
            <td class="num mono">{{ km(r.maxBlock) }}′</td>
            <td class="num mono" :class="r.conflicts > 0 && 'bad'">{{ r.conflicts || "" }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="muted m-0 mt-2">
      {{ $t("bf.plan.capacityNote", { coverage: Math.round(coverage * 100) }) }}
    </p>
  </section>
</template>

<style scoped>
.params {
  border: 1px solid var(--line);
  border-radius: 0.375rem;
  padding: 0.25rem 0.5rem 0.375rem;
}
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
.plan-table tbody tr.conf {
  background: color-mix(in srgb, var(--bad) 8%, transparent);
}
/* occupancy as a small bar */
.bar {
  display: inline-block;
  width: 5rem;
  height: 0.5rem;
  margin-right: 0.375rem;
  vertical-align: middle;
  border-radius: 0.25rem;
  background: color-mix(in srgb, var(--muted) 20%, transparent);
  overflow: hidden;
}
.bar > span {
  display: block;
  height: 100%;
  background: currentColor;
}
.good {
  color: var(--good);
}
.mid {
  color: var(--warn);
}
.bad {
  color: var(--bad);
}
.occ {
  font-weight: 600;
}
</style>
