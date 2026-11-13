<script setup lang="ts">
import type { Remark } from "@zugx/hafas";
import { computed } from "vue";

const props = defineProps<{ remarks: Remark[]; compact?: boolean }>();
const warnings = computed(() =>
  props.remarks.filter((r) => r.kind === "warning" || r.kind === "status"),
);
const hints = computed(() => props.remarks.filter((r) => r.kind === "hint"));
</script>

<template>
  <div v-if="remarks.length" class="text-xs">
    <div
      v-for="r in warnings"
      :key="r.code + r.text"
      class="my-1 border-l-2 border-[var(--warn)] pl-2"
    >
      <b v-if="r.summary">{{ r.summary }}: </b><span class="whitespace-pre-line">{{ r.text }}</span>
    </div>
    <div v-if="hints.length && !compact" class="muted mt-1 flex flex-wrap gap-x-3">
      <span v-for="r in hints" :key="r.code + r.text">· {{ r.text }}</span>
    </div>
  </div>
</template>
