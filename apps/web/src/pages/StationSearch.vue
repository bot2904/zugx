<script setup lang="ts">
import type { Location } from "@zugx/hafas";
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api } from "../lib/api.ts";
import { loadStations, searchStations, type Station } from "../lib/stations.ts";

const route = useRoute();
const router = useRouter();
const q = ref(typeof route.query.q === "string" ? route.query.q : "");
const local = ref<Station[]>([]);
const online = ref<Location[]>([]);

async function run() {
  await loadStations();
  local.value = searchStations(q.value, 30);
  online.value =
    q.value.length > 1
      ? await api()
          .locations(q.value, 15)
          .catch(() => [])
      : [];
}
onMounted(run);
watch(q, (v) => {
  void router.replace({ query: v ? { q: v } : {} });
  void run();
});
const onlineOnly = computed(() =>
  online.value.filter((o) => !local.value.some((l) => l.id === o.id)),
);
</script>

<template>
  <section>
    <input
      v-model="q"
      class="input w-full text-base"
      :placeholder="$t('search.placeholder')"
      :aria-label="$t('search.placeholder')"
      autofocus
    />
    <table class="dense mt-3">
      <tbody>
        <tr v-for="s in local" :key="s.id">
          <td><RouterLink :to="`/station/${s.id}`">{{ s.name }}</RouterLink></td>
          <td class="muted mono text-xs">{{ s.p?.join(" ") }}</td>
          <td class="muted mono text-right text-xs">{{ s.id }}</td>
        </tr>
        <tr v-for="s in onlineOnly" :key="'o' + s.id">
          <td>
            <RouterLink v-if="s.type === 'station'" :to="`/station/${s.id}`">{{
              s.name
            }}</RouterLink>
            <span v-else>{{ s.name }}</span>
            <span class="muted ml-1 text-xs">⌁ {{ $t("search.online") }}</span>
          </td>
          <td class="muted text-xs">{{ s.type }}</td>
          <td class="muted mono text-right text-xs">{{ s.id }}</td>
        </tr>
      </tbody>
    </table>
    <p v-if="q && !local.length && !online.length" class="muted">{{ $t("search.noResults") }}</p>
  </section>
</template>
