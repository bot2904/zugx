<script setup lang="ts">
// Planning panel "Pünktlichkeit" (PLAN.md "Bildfahrplan as a planning tool", item 6): where
// trains lose time — delay gained per stretch and per stop, from the live data (observed
// realtime times only, no forecasts). Collected in this browser while the live overlay runs,
// kept for 7 days per sheet.
import type { CorridorStation } from "@zugx/netz";
import type { LossRow } from "../lib/bf-plan.ts";

defineProps<{
  stations: CorridorStation[];
  rows: LossRow[];
  days: number;
  runs: number;
  liveOn: boolean;
  isToday: boolean;
}>();
const emit = defineEmits<{ live: [] }>();
const cls = (m: number) => (m >= 1 ? "bad" : m >= 0.5 ? "mid" : m < 0 ? "slack" : "good");
const fmt = (v: number) => `${v > 0 ? "+" : ""}${v.toLocaleString(undefined)}′`;
</script>

<template>
  <section class="card bf-plan mt-2 p-2 text-xs">
    <div class="mb-2 flex flex-wrap items-center gap-2">
      <strong>{{ $t("bf.plan.punctuality") }}</strong>
      <span class="muted">{{ $t("bf.plan.punctualitySummary", { days, runs }) }}</span>
      <button
        v-if="!liveOn"
        class="btn py-0"
        :disabled="!isToday"
        v-tip="isToday ? undefined : $t('bf.liveOnlyToday')"
        @click="emit('live')"
      >
        ● {{ $t("bf.plan.collect") }}
      </button>
    </div>
    <p v-if="!rows.length" class="muted m-0">{{ $t("bf.plan.noPunctuality") }}</p>
    <div v-else class="overflow-x-auto">
      <table class="plan-table">
        <thead>
          <tr>
            <th>{{ $t("bf.plan.where") }}</th>
            <th class="num">{{ $t("bf.plan.runs") }}</th>
            <th class="num">{{ $t("bf.plan.meanLoss") }}</th>
            <th class="num">{{ $t("bf.plan.shareLoss") }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="`${r.i}|${r.j}`">
            <td>
              <template v-if="r.i === r.j"
                >{{ $t("bf.plan.stopAt") }} {{ stations[r.i]?.name }}</template
              >
              <template v-else>{{ stations[r.i]?.name }} → {{ stations[r.j]?.name }}</template>
            </td>
            <td class="num mono">{{ r.n }}</td>
            <td class="num mono">
              <span class="loss" :class="cls(r.mean)">{{ fmt(r.mean) }}</span>
            </td>
            <td class="num mono">{{ Math.round(r.bad * 100) }} %</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="muted m-0 mt-2">{{ $t("bf.plan.punctualityNote") }}</p>
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
.loss {
  font-weight: 600;
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
.slack {
  color: var(--link);
}
</style>
