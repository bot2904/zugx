<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { categoryColor, lineColor } from "../lib/products.ts";
import type { Line } from "@zugx/hafas";

const props = defineProps<{ line?: Line; cat?: string; nr?: string; small?: boolean }>();
const label = computed(() => props.line?.name ?? `${props.cat ?? ""} ${props.nr ?? ""}`.trim());
const { t } = useI18n();
const title = computed(() => {
  const l = props.line;
  if (!l) return undefined;
  const parts = [
    l.categoryLong,
    l.trainNumber && `${t("trip.trainNumber")} ${l.trainNumber}`,
    l.operator,
  ];
  return parts.filter(Boolean).join(" · ") || undefined;
});
const color = computed(() => (props.line ? lineColor(props.line) : categoryColor(props.cat ?? "")));
</script>

<template>
  <span
    class="mono inline-block whitespace-nowrap rounded px-1.5 font-semibold text-white"
    :class="small ? 'text-[11px] leading-4' : 'text-xs leading-5'"
    :style="{ background: color }"
    :title="title"
    >{{ label }}</span
  >
</template>
