<script setup lang="ts">
import type { StopEvent } from "@zugx/hafas";
import { delayClass, fmtDelay, hhmm } from "../lib/format.ts";

defineProps<{ ev?: StopEvent; showActual?: boolean }>();
</script>

<template>
  <span v-if="ev" class="mono whitespace-nowrap">
    <span :class="ev.cancelled ? 'line-through muted' : ''">{{ hhmm(ev.planned) }}</span>
    <sup
      v-if="ev.delay !== undefined && !ev.cancelled"
      class="ml-0.5 text-[10px]"
      :class="delayClass(ev)"
      >{{ fmtDelay(ev) }}</sup
    >
    <span v-if="showActual && ev.actual && ev.delay" class="ml-1 text-xs" :class="delayClass(ev)">{{
      hhmm(ev.actual)
    }}</span>
  </span>
</template>
