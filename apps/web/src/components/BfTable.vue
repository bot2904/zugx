<script setup lang="ts">
// Timetable table below the Bildfahrplan, like the printed station timetables (Aushangfahrplan):
// one direction only (the shown one), a row per train, a column per station with its departure
// (arrival at the last station), "|" where it passes without stopping, then the destination.
import type { CorridorTrain } from "@zugx/netz";
import { computed, ref, useTemplateRef, watch } from "vue";
import LineBadge from "./LineBadge.vue";
import { trainSlug } from "../lib/url.ts";
import { hhmm, tableRuns, type TableStation } from "../lib/bf-table.ts";

const props = defineProps<{
  stations: TableStation[];
  trains: CorridorTrain[];
  /** 1 = shown stations in corridor order, -1 = reversed */
  dir: 1 | -1;
  t0: number;
  t1: number;
  date: string;
  hover?: CorridorTrain;
  /** scroll the hovered train's row into view (table in its own window, hover from the chart) */
  follow?: boolean;
}>();
const emit = defineEmits<{ hover: [t: CorridorTrain | undefined] }>();

const rows = computed(() => {
  const last = props.stations.length - 1;
  return tableRuns(props.stations, props.trains, props.dir, props.t0, props.t1).map((r) => ({
    ...r,
    cells: r.at.map((x, k) =>
      !x ? "" : x.pass ? "|" : hhmm((k === last ? (x.a ?? x.d) : (x.d ?? x.a))!),
    ),
  }));
});

const tbody = useTemplateRef<HTMLElement>("tbody");
const inside = ref(false);
watch(
  () => props.hover,
  (h) => {
    if (!props.follow || inside.value || !h) return;
    const k = rows.value.findIndex((r) => r.t === h);
    tbody.value?.children[k]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  },
);
</script>

<template>
  <div v-if="rows.length" class="card bf-table mt-2 overflow-x-auto p-1">
    <h2 class="sticky left-0 m-0 px-1 text-sm font-semibold">
      {{ stations[0]?.name }} – {{ stations.at(-1)?.name }}
    </h2>
    <table class="mono text-xs">
      <thead>
        <tr>
          <th class="sticky-col" />
          <th
            v-for="s in stations"
            :key="s.id"
            class="station"
            :class="s.major ? 'font-semibold' : 'muted font-normal'"
          >
            <span>{{ s.name }}</span>
          </th>
          <th class="station muted font-normal">
            <span>{{ $t("bf.tableTo") }}</span>
          </th>
        </tr>
      </thead>
      <tbody ref="tbody" @mouseenter="inside = true" @mouseleave="inside = false">
        <tr
          v-for="r in rows"
          :key="`${r.t.cat} ${r.t.nr} ${r.first}`"
          :class="hover === r.t && 'hovered'"
          @mouseenter="emit('hover', r.t)"
          @mouseleave="emit('hover', undefined)"
        >
          <th class="sticky-col text-left font-normal">
            <RouterLink
              :to="{ query: { ...$route.query, train: trainSlug(`${r.t.cat} ${r.t.nr}`) } }"
              ><LineBadge :cat="r.t.cat" :nr="r.t.nr" small
            /></RouterLink>
          </th>
          <td
            v-for="(c, k) in r.cells"
            :key="k"
            :class="[stations[k]?.major && 'major', c === '|' && 'muted']"
          >
            {{ c }}
          </td>
          <td class="whitespace-nowrap text-left font-sans">{{ r.to }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
table {
  border-collapse: collapse;
}
th,
td {
  padding: 0.0625rem 0.375rem;
  text-align: right;
  white-space: nowrap;
}
tbody tr:nth-child(even) {
  background: var(--bg);
}
tbody tr.hovered {
  background: color-mix(in srgb, var(--accent) 15%, transparent);
}
td.major {
  font-weight: 600;
}
/* station names rotated, read bottom-up like the printed timetables */
th.station {
  vertical-align: bottom;
  padding-bottom: 0.25rem;
}
th.station span {
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  display: inline-block;
  max-height: 11rem;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: var(--font-sans, system-ui, sans-serif);
}
.sticky-col {
  position: sticky;
  left: 0;
  background: var(--bg2);
}
</style>
