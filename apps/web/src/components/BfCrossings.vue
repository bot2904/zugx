<script setup lang="ts">
// Planning panel "Kreuzungen": where trains of opposite directions meet next to single track
// (PLAN.md "Bildfahrplan as a planning tool", items 4 and 5) — the buffer each way (how late the
// opposite train may be before this one has to wait), and meetings between stations on single
// track (conflicts). With live data: the knock-on delay expected from the current delays.
import type { CorridorStation, CorridorTrain } from "@zugx/netz";
import { computed } from "vue";
import LineBadge from "./LineBadge.vue";
import { bufferClass, type Crossing } from "../lib/bf-plan.ts";
import { hhmm } from "../lib/bf-table.ts";

const props = defineProps<{
  stations: CorridorStation[];
  list: Crossing[];
  /** current delay of a train (live), if known */
  delayOf?: (t: CorridorTrain) => number | undefined;
  hover?: CorridorTrain;
}>();
const emit = defineEmits<{ hover: [t: CorridorTrain | undefined] }>();

const where = (c: Crossing) =>
  c.i2 === undefined
    ? props.stations[c.i]?.name
    : `${props.stations[c.i]?.name} – ${props.stations[c.i2]?.name}`;
const summary = computed(() => ({
  n: props.list.length,
  fragile: props.list.filter((c) => Math.min(c.bufUp ?? 99, c.bufDown ?? 99) <= 2).length,
  conflicts: props.list.filter((c) => c.conflict).length,
}));
/**
 * knock-on delay: the waiting train is delayed by (delay of the other − buffer); `buf` belongs to
 * `waiting`, `late` is the train it waits for
 */
function knockOn(buf: number | undefined, late: CorridorTrain): number | undefined {
  const d = props.delayOf?.(late);
  return buf === undefined || d === undefined || d <= buf ? undefined : d - buf;
}
</script>

<template>
  <section class="card bf-plan mt-2 p-2 text-xs">
    <p class="m-0 mb-2">
      <strong>{{ $t("bf.plan.crossings") }}:</strong>
      {{ $t("bf.plan.crossingsSummary", summary) }}
    </p>
    <p v-if="!list.length" class="muted m-0">{{ $t("bf.plan.noCrossings") }}</p>
    <div v-else class="overflow-x-auto">
      <table class="plan-table">
        <thead>
          <tr>
            <th class="num">{{ $t("bf.plan.time") }}</th>
            <th>{{ $t("bf.plan.where") }}</th>
            <th>→ {{ stations.at(-1)?.name }}</th>
            <th class="num">{{ $t("bf.plan.buffer") }}</th>
            <th>→ {{ stations[0]?.name }}</th>
            <th class="num">{{ $t("bf.plan.buffer") }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(c, k) in list"
            :key="k"
            :class="(hover === c.up || hover === c.down) && 'hovered'"
          >
            <td class="num mono">{{ hhmm(c.time) }}</td>
            <td>
              <span v-if="c.loop" class="muted" v-tip="$t('bf.plan.loopTip')">
                {{
                  $t("bf.plan.loop", {
                    km: c.km.toLocaleString(undefined, { maximumFractionDigits: 1 }),
                  })
                }}:
              </span>
              <span v-if="c.conflict" class="conflict" v-tip="$t('bf.plan.conflictTip')">
                ⚠ {{ $t("bf.plan.onLine") }}: </span
              >{{ where(c) }}
            </td>
            <td @mouseenter="emit('hover', c.up)" @mouseleave="emit('hover', undefined)">
              <LineBadge :cat="c.up.cat" :nr="c.up.nr" small />
            </td>
            <td class="num mono">
              <span
                v-if="c.bufUp !== undefined"
                class="buf"
                :class="bufferClass(c.bufUp)"
                v-tip="
                  $t('bf.plan.bufferTip', {
                    late: `${c.down.cat} ${c.down.nr}`,
                    buf: c.bufUp,
                    waiting: `${c.up.cat} ${c.up.nr}`,
                  })
                "
                >{{ c.bufUp }}′</span
              >
              <span v-if="knockOn(c.bufUp, c.down)" class="knock">
                +{{ knockOn(c.bufUp, c.down) }}′</span
              >
            </td>
            <td @mouseenter="emit('hover', c.down)" @mouseleave="emit('hover', undefined)">
              <LineBadge :cat="c.down.cat" :nr="c.down.nr" small />
            </td>
            <td class="num mono">
              <span
                v-if="c.bufDown !== undefined"
                class="buf"
                :class="bufferClass(c.bufDown)"
                v-tip="
                  $t('bf.plan.bufferTip', {
                    late: `${c.up.cat} ${c.up.nr}`,
                    buf: c.bufDown,
                    waiting: `${c.down.cat} ${c.down.nr}`,
                  })
                "
                >{{ c.bufDown }}′</span
              >
              <span v-if="knockOn(c.bufDown, c.up)" class="knock">
                +{{ knockOn(c.bufDown, c.up) }}′</span
              >
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="muted m-0 mt-2">{{ $t("bf.plan.crossingsNote") }}</p>
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
.buf {
  font-weight: 600;
}
.good {
  color: var(--good);
}
.mid {
  color: var(--warn);
}
.bad,
.conflict,
.knock {
  color: var(--bad);
}
.knock {
  margin-left: 0.25rem;
}
</style>
