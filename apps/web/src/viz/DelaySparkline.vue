<script setup lang="ts">
// Delay along a train run: one point per stop (departure delay, else arrival delay).
import type { Stopover } from "@zugx/hafas";
import { computed } from "vue";
import { delayColor } from "../lib/delay.ts";

const props = defineProps<{ stops: Stopover[]; height?: number }>();
const H = computed(() => props.height ?? 60);
const W = 600;

const pts = computed(() =>
  props.stops.map((s, i) => ({
    i,
    d: s.dep?.delay ?? s.arr?.delay,
    name: s.stop.name,
    cancelled: s.cancelled,
  })),
);
const max = computed(() => Math.max(5, ...pts.value.map((p) => p.d ?? 0)));
const min = computed(() => Math.min(0, ...pts.value.map((p) => p.d ?? 0)));
const x = (i: number) =>
  props.stops.length > 1 ? (i / (props.stops.length - 1)) * (W - 8) + 4 : W / 2;
const y = (d: number) => 6 + (1 - (d - min.value) / (max.value - min.value || 1)) * (H.value - 14);
const path = computed(() =>
  pts.value
    .filter((p) => p.d !== undefined)
    .map((p, k) => `${k ? "L" : "M"}${x(p.i).toFixed(1)},${y(p.d!).toFixed(1)}`)
    .join(""),
);
// same scale as the radar and the train map
const color = (d?: number) => delayColor(d);
const hasData = computed(() => pts.value.some((p) => p.d !== undefined));
</script>

<template>
  <svg
    v-if="hasData"
    :viewBox="`0 0 ${W} ${H}`"
    class="block h-auto w-full"
    role="img"
    :aria-label="$t('trip.delayProfile')"
  >
    <line x1="0" :x2="W" :y1="y(0)" :y2="y(0)" stroke="var(--line)" />
    <text x="2" :y="y(max) + 4" font-size="9" fill="var(--muted)" class="mono">+{{ max }}′</text>
    <path :d="path" fill="none" stroke="var(--muted)" stroke-width="1.5" />
    <circle
      v-for="p in pts.filter((q) => q.d !== undefined)"
      :key="p.i"
      :cx="x(p.i)"
      :cy="y(p.d!)"
      r="3"
      :fill="color(p.d)"
    >
      <title>{{ p.name }}: {{ p.d! > 0 ? "+" : "" }}{{ p.d }}′</title>
    </circle>
  </svg>
</template>
