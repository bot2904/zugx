<script setup lang="ts">
import { computed } from "vue";
import { categoryColor, lineColor } from "../lib/products.ts";
import type { Line } from "@zugx/hafas";

const props = defineProps<{ line?: Line; cat?: string; nr?: string; small?: boolean }>();
const label = computed(() => props.line?.name ?? `${props.cat ?? ""} ${props.nr ?? ""}`.trim());
const color = computed(() => (props.line ? lineColor(props.line) : categoryColor(props.cat ?? "")));
</script>

<template>
  <span
    class="mono inline-block whitespace-nowrap rounded px-1.5 font-semibold text-white"
    :class="small ? 'text-[11px] leading-4' : 'text-xs leading-5'"
    :style="{ background: color }"
    :title="
      line?.categoryLong
        ? `${line.categoryLong}${line.operator ? ' · ' + line.operator : ''}`
        : undefined
    "
    >{{ label }}</span
  >
</template>
