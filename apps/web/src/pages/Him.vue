<script setup lang="ts">
import type { Warning } from "@zugx/hafas";
import { computed, onMounted, ref } from "vue";
import Status from "../components/Status.vue";
import { api } from "../lib/api.ts";
import { useAsync } from "../lib/async.ts";

const msgs = useAsync<Warning[]>(() => api().warnings(300));
onMounted(msgs.run);
const q = ref("");
const shown = computed(() => {
  const s = q.value.toLowerCase();
  return (msgs.data.value ?? [])
    .filter(
      (m) =>
        !s ||
        `${m.title} ${m.text} ${m.affectedFrom?.name ?? ""} ${m.affectedTo?.name ?? ""}`
          .toLowerCase()
          .includes(s),
    )
    .sort((a, b) => (b.modified ?? "").localeCompare(a.modified ?? ""));
});
const d = (iso?: string) =>
  iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}. ${iso.slice(11, 16)}` : "";
</script>

<template>
  <section>
    <div class="flex items-center gap-2">
      <h1 class="m-0 text-xl">{{ $t("him.title") }}</h1>
      <span class="muted text-xs">{{ shown.length }}</span>
      <input v-model="q" class="input ml-auto" :placeholder="$t('him.filter')" />
    </div>
    <Status :loading="msgs.loading.value" :error="msgs.error.value" @retry="msgs.run" />
    <article v-for="m in shown" :key="m.id" class="card my-2 p-3">
      <div class="flex flex-wrap items-baseline gap-2">
        <b>{{ m.title }}</b>
        <span v-if="m.affectedFrom" class="text-sm">
          {{ m.affectedFrom.name
          }}<template v-if="m.affectedTo && m.affectedTo.id !== m.affectedFrom.id">
            – {{ m.affectedTo.name }}</template
          >
        </span>
        <span class="muted mono ml-auto text-xs"
          >{{ $t("him.valid") }} {{ d(m.validFrom) }} – {{ d(m.validUntil) }}</span
        >
      </div>
      <p class="m-0 mt-1 whitespace-pre-line text-sm">{{ m.text }}</p>
    </article>
    <p v-if="msgs.data.value && !shown.length" class="muted">{{ $t("him.empty") }}</p>
  </section>
</template>
