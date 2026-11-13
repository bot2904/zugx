<script setup lang="ts">
// Sortable column header: real <button> inside <th scope=col>, state via aria-sort on the <th> only
// (modern-web-guidance: sortable-table).
defineProps<{ active: boolean; desc: boolean; title?: string }>();
defineEmits<{ sort: [] }>();
</script>

<template>
  <th
    scope="col"
    class="sort-th"
    :aria-sort="active ? (desc ? 'descending' : 'ascending') : undefined"
  >
    <button type="button" :title="title" @click="$emit('sort')">
      <slot />
      <svg class="sort-icon" viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
        <path d="M5 2 8 6H2z" fill="currentColor" />
      </svg>
    </button>
  </th>
</template>

<style>
table.dense th:has(> button) {
  padding: 0;
}
.sort-th > button {
  all: unset;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  min-height: 24px;
  padding: 4px 6px;
  cursor: pointer;
  font: inherit;
  color: inherit;
}
.sort-th.text-right > button {
  justify-content: flex-end;
}
.sort-th > button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
/* direction icon driven by aria-sort, hidden on unsorted columns */
.sort-th .sort-icon {
  visibility: hidden;
}
.sort-th[aria-sort] .sort-icon {
  visibility: visible;
}
.sort-th[aria-sort="descending"] .sort-icon {
  rotate: 180deg;
}
</style>
