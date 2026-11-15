<script setup lang="ts">
// Timetable table below the Bildfahrplan, like the printed station timetables (Aushangfahrplan):
// one direction only (the shown one), a row per train, a column per station with its departure
// (arrival at the last station), "|" where it passes without stopping, then the destination.
import type { CorridorTrain } from "@zugx/netz";
import { computed, ref, useTemplateRef, watch } from "vue";
import LineBadge from "./LineBadge.vue";
import { trainSlug } from "../lib/url.ts";

const props = defineProps<{
  stations: { id: string; i: number; name: string; major: boolean }[];
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

const hhmm = (min: number) =>
  `${Math.floor(min / 60) % 24}:${String(Math.round(min) % 60).padStart(2, "0")}`;
/**
 * passing points carry interpolated times with one decimal and arrival = departure (see
 * passingPoints in @zugx/netz); stops have whole minutes
 */
const isPass = (a: number | null, d: number | null) => a !== null && a === d && a % 1 !== 0;

const rows = computed(() => {
  const col = new Map(props.stations.map((s, k) => [s.i, k]));
  const last = props.stations.length - 1;
  const out: { t: CorridorTrain; cells: string[]; first: number; to?: string }[] = [];
  for (const t of props.trains) {
    if (t.dir !== props.dir) continue;
    const cells: string[] = Array.from({ length: props.stations.length }, () => "");
    let first: number | undefined;
    let lastK = -1;
    for (const [i, a, d] of t.pts) {
      const k = col.get(i);
      if (k === undefined) continue;
      const tm = k === last ? (a ?? d) : (d ?? a);
      if (tm === null) continue;
      first ??= tm;
      cells[k] = isPass(a, d) ? "|" : hhmm(tm);
      lastK = Math.max(lastK, k);
    }
    // at least two stations of the section, starting in the time window
    if (first === undefined || first < props.t0 || first >= props.t1) continue;
    if (cells.filter(Boolean).length < 2) continue;
    // fill the stretch between the train's first and last station: passes not in the data
    const firstK = cells.findIndex(Boolean);
    for (let k = firstK; k < lastK; k++) if (!cells[k]) cells[k] = "|";
    // destination where it lies beyond the train's last shown station
    const to = t.headsign !== props.stations[lastK]?.name ? t.headsign : undefined;
    out.push({ t, cells, first, ...(to ? { to } : {}) });
  }
  return out.sort((x, y) => x.first - y.first);
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
              :to="{ path: `/train/${trainSlug(`${r.t.cat} ${r.t.nr}`)}`, query: { d: date } }"
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
