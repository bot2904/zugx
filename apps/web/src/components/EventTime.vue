<script setup lang="ts">
import type { StopEvent } from "@zugx/hafas";
import { delayClass, fmtDelay, hhmm } from "../lib/format.ts";

/** showActual: the realtime time next to the planned one (`below`: underneath, for narrow columns) */
defineProps<{ ev?: StopEvent; showActual?: boolean; below?: boolean }>();
</script>

<template>
  <span v-if="ev" class="mono whitespace-nowrap">
    <span :class="ev.cancelled ? 'line-through muted' : ''">{{ hhmm(ev.planned) }}</span>
    <sup
      v-if="ev.delay !== undefined && !ev.cancelled"
      class="ml-0.5 text-[0.625rem]"
      :class="delayClass(ev)"
      >{{ fmtDelay(ev) }}</sup
    >
    <span
      v-if="showActual && ev.actual && ev.delay && !ev.cancelled"
      class="text-xs"
      :class="[delayClass(ev), below ? 'block leading-3' : 'ml-1']"
      >{{ hhmm(ev.actual) }}</span
    >
  </span>
</template>
