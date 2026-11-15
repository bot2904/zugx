<script setup lang="ts">
import type { StopEvent } from "@zugx/hafas";
defineProps<{ ev?: StopEvent }>();
</script>

<template>
  <span
    v-if="ev?.platform"
    class="mono whitespace-nowrap"
    :class="
      ev.plannedPlatform && ev.platform !== ev.plannedPlatform
        ? 'text-[var(--warn)] font-semibold'
        : ''
    "
    v-tip="
      ev.plannedPlatform && ev.platform !== ev.plannedPlatform
        ? `→ ${ev.platform} (${ev.plannedPlatform})`
        : ''
    "
    >{{ ev.platform }}</span
  >
</template>
