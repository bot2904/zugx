<script setup lang="ts">
// Planning panel "Knoten": Taktknoten check and transfers at one station of the Bildfahrplan
// (PLAN.md "Bildfahrplan as a planning tool", items 1 and 2). Only trains of this sheet: transfers
// to lines not on the sheet are not in the data.
import type { CorridorStation, CorridorTrain } from "@zugx/netz";
import { computed, ref } from "vue";
import LineBadge from "./LineBadge.vue";
import { connections, linesAtNode, nodeVerdict, waitClass } from "../lib/bf-plan.ts";
import { hhmm } from "../lib/bf-table.ts";

const props = defineProps<{
  stations: CorridorStation[];
  /** index of the node station in `stations` */
  node: number;
  /** stations selectable as node (indices, display order) */
  choices: number[];
  trains: CorridorTrain[];
  t0: number;
  t1: number;
  hover?: CorridorTrain;
}>();
const emit = defineEmits<{ node: [i: number]; hover: [t: CorridorTrain | undefined] }>();

const minTransfer = ref(3);
const allLines = ref(false);
const lines = computed(() => linesAtNode(props.trains, props.node));
const verdict = computed(() => nodeVerdict(lines.value));
const rows = computed(() =>
  connections(props.trains, props.node, props.t0, props.t1, minTransfer.value),
);
const dirName = (dir: 1 | -1) =>
  dir === 1 ? props.stations.at(-1)?.name : props.stations[0]?.name;
const mm = (m: number | null) => (m === null ? "–" : `:${String(m).padStart(2, "0")}`);
const sym = (s: number) => {
  const f = (v: number) => `:${v.toFixed(1).replace(/\.0$/, "").padStart(2, "0")}`;
  return `${f(s)} / ${f(s + 30)}`;
};
</script>

<template>
  <section class="card bf-plan mt-2 p-2 text-xs">
    <div class="mb-2 flex flex-wrap items-center gap-2">
      <label class="flex items-center gap-1">
        {{ $t("bf.plan.node") }}
        <select
          class="input text-xs"
          :value="node"
          @change="emit('node', Number(($event.target as HTMLSelectElement).value))"
        >
          <option v-for="i in choices" :key="i" :value="i">{{ stations[i]?.name }}</option>
        </select>
      </label>
      <label class="flex items-center gap-1">
        {{ $t("bf.plan.minTransfer") }}
        <input
          v-model.number="minTransfer"
          type="number"
          min="0"
          max="15"
          class="input w-14 text-xs"
        />
        ′
      </label>
    </div>

    <!-- 2. Taktknoten -->
    <p class="m-0 mb-1">
      <strong>{{ $t("bf.plan.taktknoten") }}:</strong>
      <template v-if="verdict.minute !== undefined">
        {{
          $t("bf.plan.nodeAt", {
            minute: mm(verdict.minute),
            kind:
              verdict.minute === 0
                ? $t("bf.plan.vollknoten")
                : verdict.minute === 30
                  ? $t("bf.plan.halbknoten")
                  : $t("bf.plan.viertelknoten"),
            n: verdict.meeting,
            of: verdict.lines,
          })
        }}
      </template>
      <template v-else>{{ $t("bf.plan.noNode", { of: verdict.lines }) }}</template>
      <template v-if="verdict.symmetry.length">
        · {{ $t("bf.plan.symmetry") }}:
        <template v-for="(s, k) in verdict.symmetry" :key="s.cat"
          ><template v-if="k">, </template>{{ s.cat }} {{ sym(s.minute) }}</template
        >
      </template>
    </p>
    <div class="overflow-x-auto">
      <table class="plan-table">
        <thead>
          <tr>
            <th>{{ $t("bf.plan.line") }}</th>
            <th>{{ $t("bf.tableTo") }}</th>
            <th class="num">{{ $t("bf.plan.arr") }}</th>
            <th class="num">{{ $t("bf.plan.dep") }}</th>
            <th class="num">{{ $t("bf.plan.headway") }}</th>
            <th class="num">{{ $t("bf.plan.trains") }}</th>
            <th class="num">{{ $t("bf.plan.regular") }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="l in allLines ? lines : lines.filter((x) => x.n >= 3)"
            :key="`${l.cat}|${l.dir}|${l.to}`"
          >
            <td><LineBadge :cat="l.cat" small /></td>
            <td>{{ l.dir === 1 ? "→" : "←" }} {{ l.to }}</td>
            <td class="num mono">{{ mm(l.arrMin) }}</td>
            <td class="num mono">{{ mm(l.depMin) }}</td>
            <td class="num mono">{{ l.headway ? `${l.headway}′` : "–" }}</td>
            <td class="num mono">{{ l.n }}</td>
            <td class="num mono" :class="l.regular < 0.5 && 'muted'">
              {{ Math.round(l.regular * 100) }} %
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <button
      v-if="lines.some((x) => x.n < 3)"
      class="btn mt-1 py-0 text-xs"
      @click="allLines = !allLines"
    >
      {{
        allLines
          ? $t("bf.plan.regularLines")
          : $t("bf.plan.allLines", { n: lines.filter((x) => x.n < 3).length })
      }}
    </button>

    <!-- 1. transfers -->
    <h3 class="m-0 mt-3 mb-1 text-sm">{{ $t("bf.plan.transfers") }}</h3>
    <p v-if="!rows.length" class="muted m-0">{{ $t("bf.plan.noArrivals") }}</p>
    <div v-else class="overflow-x-auto">
      <table class="plan-table">
        <thead>
          <tr>
            <th class="num">{{ $t("bf.plan.arr") }}</th>
            <th>{{ $t("bf.plan.train") }}</th>
            <th>{{ $t("bf.tableFrom") }}</th>
            <th>→ {{ dirName(1) }}</th>
            <th>→ {{ dirName(-1) }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="r in rows"
            :key="`${r.arr.t.cat} ${r.arr.t.nr} ${r.arr.a}`"
            :class="hover === r.arr.t && 'hovered'"
            @mouseenter="emit('hover', r.arr.t)"
            @mouseleave="emit('hover', undefined)"
          >
            <td class="num mono">{{ hhmm(r.arr.a) }}</td>
            <td><LineBadge :cat="r.arr.t.cat" :nr="r.arr.t.nr" small /></td>
            <td class="muted">{{ r.arr.t.origin }}</td>
            <td v-for="d in r.dirs" :key="d.dir">
              <span v-if="d.continues" class="muted">{{ $t("bf.plan.continues") }}</span>
              <template v-else>
                <span v-if="d.next" class="whitespace-nowrap">
                  <LineBadge :cat="d.next.t.cat" :nr="d.next.t.nr" small />
                  <span class="wait mono" :class="waitClass(d.next.wait)">
                    {{ Math.round(d.next.wait) }}′</span
                  >
                </span>
                <span v-else class="muted">–</span>
                <span
                  v-if="d.missed"
                  class="missed ml-1 whitespace-nowrap"
                  v-tip="
                    $t('bf.plan.missedTip', {
                      train: `${d.missed.t.cat} ${d.missed.t.nr}`,
                      short: d.missed.short,
                      min: minTransfer,
                    })
                  "
                >
                  ✗ {{ d.missed.t.cat }} {{ d.missed.t.nr }}
                  {{ $t("bf.plan.short", { n: d.missed.short }) }}
                </span>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="muted m-0 mt-2">{{ $t("bf.plan.nodeNote") }}</p>
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
.plan-table tbody tr.hovered {
  background: color-mix(in srgb, var(--accent) 15%, transparent);
}
.wait {
  margin-left: 0.25rem;
  font-weight: 600;
}
.wait.good {
  color: var(--good);
}
.wait.mid {
  color: var(--warn);
}
.wait.bad {
  color: var(--bad);
}
.missed {
  color: var(--bad);
  font-size: 0.6875rem;
}
</style>
