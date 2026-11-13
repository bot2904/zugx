<script setup lang="ts">
defineProps<{ loading?: boolean; error?: string }>();
defineEmits<{ retry: [] }>();
</script>

<template>
  <div v-if="error" class="card my-2 border-[var(--bad)] p-3 text-sm">
    <span class="text-[var(--bad)]">{{ $t("common.error") }}:</span> {{ error }}
    <button class="btn ml-2" @click="$emit('retry')">{{ $t("common.retry") }}</button>
  </div>
  <div v-else-if="loading" class="muted my-2 animate-pulse text-sm">{{ $t("common.loading") }}</div>
</template>
