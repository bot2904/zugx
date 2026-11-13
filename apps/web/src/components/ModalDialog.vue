<script setup lang="ts">
// Native modal <dialog>: focus containment, Esc/back gesture, top layer, focus return to the invoker.
// Light dismiss via closedby="any" (+ fallback for browsers without it).
import { onMounted, ref, watch } from "vue";

defineProps<{ label: string }>();
const open = defineModel<boolean>({ default: false });
const dlg = ref<HTMLDialogElement>();

watch(open, (o) => {
  const d = dlg.value;
  if (!d) return;
  if (o && !d.open) d.showModal();
  else if (!o && d.open) d.close();
});

onMounted(() => {
  if (open.value) dlg.value?.showModal();
});

// the "close" event is dispatched asynchronously: if the dialog was reopened in the meantime
// (e.g. Esc then Ctrl+K in quick succession), ignore the stale event
function onClose() {
  if (!dlg.value?.open) open.value = false;
}

const supportsClosedBy = "closedBy" in HTMLDialogElement.prototype;
function onClick(e: MouseEvent) {
  // fallback light dismiss: a click on the backdrop targets the <dialog> itself, outside its box
  if (supportsClosedBy || e.target !== dlg.value) return;
  const r = dlg.value.getBoundingClientRect();
  const inside =
    e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  if (!inside) dlg.value.close();
}
</script>

<template>
  <dialog
    ref="dlg"
    closedby="any"
    :aria-label="label"
    class="card m-auto mt-[12vh] w-[min(560px,92vw)] p-2 text-[var(--fg)] shadow-2xl"
    @close="onClose"
    @click="onClick"
  >
    <slot v-if="open" />
  </dialog>
</template>

<style>
dialog:modal {
  overscroll-behavior: contain;
}
dialog::backdrop {
  background: rgb(0 0 0 / 0.5);
  overflow: hidden;
  overscroll-behavior: contain;
}
</style>
