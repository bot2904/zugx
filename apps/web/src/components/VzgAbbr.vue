<script setup lang="ts">
// Text with every "VzG" as an abbreviation (tooltip with the full name of the ÖBB directory).
import { computed } from "vue";

const props = defineProps<{ text: string }>();
const parts = computed(() => props.text.split(/(VzG)/));
const FULL = "Verzeichnis der örtlich zulässigen Geschwindigkeiten und Besonderheiten";
</script>

<template>
  <template v-for="(p, i) in parts" :key="i"
    ><abbr v-if="p === 'VzG'" :title="FULL">VzG</abbr><template v-else>{{ p }}</template></template
  >
</template>
