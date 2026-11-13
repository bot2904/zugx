<script setup lang="ts">
// Toggletip: a button that reveals extra information on click/tap (and on hover/focus where
// `interestfor` is supported), so it also works on touch devices and with screen readers.
// (modern-web-guidance: interest-triggered-tooltips)
import { onMounted, ref, useId } from "vue";

defineProps<{ label: string }>();
const id = `tip-${useId()}`;
const btn = ref<HTMLButtonElement>();
const tip = ref<HTMLElement>();
const expanded = ref(false);

// popover="hint" where supported (light dismiss without closing other popovers), else "auto"
const kind = (() => {
  const el = document.createElement("div");
  el.setAttribute("popover", "hint");
  return el.popover === "hint" ? "hint" : "auto";
})();

function place() {
  const b = btn.value?.getBoundingClientRect();
  const t = tip.value;
  if (!b || !t) return;
  const left = Math.max(8, Math.min(b.left, innerWidth - t.offsetWidth - 8));
  const below = b.bottom + 6 + t.offsetHeight < innerHeight;
  t.style.left = `${left}px`;
  t.style.top = `${below ? b.bottom + 6 : b.top - t.offsetHeight - 6}px`;
}

onMounted(() => {
  tip.value?.addEventListener("toggle", (e) => {
    expanded.value = (e as ToggleEvent).newState === "open";
    if (expanded.value) place();
  });
});
</script>

<template>
  <button
    ref="btn"
    type="button"
    class="toggletip-btn"
    :popovertarget="id"
    popovertargetaction="show"
    :interestfor="id"
    :aria-expanded="expanded"
    :aria-label="label"
  >
    <slot name="trigger">ⓘ</slot>
  </button>
  <div :id="id" ref="tip" :popover="kind" role="tooltip" class="toggletip card">
    <slot />
  </div>
</template>

<style>
.toggletip-btn {
  all: unset;
  cursor: help;
  border-radius: 3px;
}
.toggletip-btn:focus-visible {
  outline: 2px solid var(--accent);
}
.toggletip:popover-open {
  position: fixed;
  margin: 0;
  max-inline-size: min(22rem, calc(100vw - 1rem));
  padding: 0.4rem 0.6rem;
  font-size: 0.75rem;
  white-space: pre-line;
  color: var(--fg);
  box-shadow: 0 4px 16px rgb(0 0 0 / 0.25);
}
</style>
